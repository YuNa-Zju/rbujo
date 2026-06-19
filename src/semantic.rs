use std::path::Path;

use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config, DTYPE};
use sha2::{Digest, Sha256};
use tokenizers::{Tokenizer, TruncationParams};

pub const SEMANTIC_MODEL_ID: &str = "bge-small-zh-v1.5";
pub const SEMANTIC_MODEL_VERSION: &str = "bge-small-zh-v1.5-candle-f32-v1";
pub const SEMANTIC_EMBEDDING_DIMS: usize = 512;
pub const SEMANTIC_MAX_TOKENS: usize = 512;

const BGE_QUERY_INSTRUCTION: &str = "为这个句子生成表示以用于检索相关文章：";

pub struct CandleSemanticEmbedder {
    tokenizer: Tokenizer,
    model: BertModel,
    device: Device,
}

impl std::fmt::Debug for CandleSemanticEmbedder {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("CandleSemanticEmbedder")
            .field("model_id", &SEMANTIC_MODEL_ID)
            .finish_non_exhaustive()
    }
}

impl CandleSemanticEmbedder {
    pub fn load(model_dir: impl AsRef<Path>) -> Result<Self, String> {
        let model_dir = model_dir.as_ref();
        let config_path = model_dir.join("config.json");
        let tokenizer_path = model_dir.join("tokenizer.json");
        let weights_path = model_dir.join("model.safetensors");

        let config_text = std::fs::read_to_string(&config_path)
            .map_err(|error| format!("failed to read BGE config: {error}"))?;
        let config: Config = serde_json::from_str(&config_text)
            .map_err(|error| format!("failed to parse BGE config: {error}"))?;
        if config.hidden_size != SEMANTIC_EMBEDDING_DIMS {
            return Err(format!(
                "unexpected BGE hidden size {}, expected {SEMANTIC_EMBEDDING_DIMS}",
                config.hidden_size
            ));
        }

        let mut tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|error| format!("failed to load BGE tokenizer: {error}"))?;
        tokenizer
            .with_truncation(Some(TruncationParams {
                max_length: SEMANTIC_MAX_TOKENS,
                ..Default::default()
            }))
            .map_err(|error| format!("failed to configure BGE tokenizer: {error}"))?;

        let device = Device::Cpu;
        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[weights_path], DTYPE, &device)
                .map_err(|error| format!("failed to load BGE weights: {error}"))?
        };
        let model = BertModel::load(vb, &config)
            .map_err(|error| format!("failed to initialize BGE model: {error}"))?;

        Ok(Self {
            tokenizer,
            model,
            device,
        })
    }

    pub fn embed(&self, text: &str) -> Result<Vec<f32>, String> {
        let encoding = self
            .tokenizer
            .encode(text.trim().to_string(), true)
            .map_err(|error| format!("failed to tokenize semantic text: {error}"))?;
        let token_ids = Tensor::new(encoding.get_ids(), &self.device)
            .and_then(|tensor| tensor.unsqueeze(0))
            .map_err(|error| format!("failed to build token tensor: {error}"))?;
        let attention_mask = Tensor::new(encoding.get_attention_mask(), &self.device)
            .and_then(|tensor| tensor.unsqueeze(0))
            .map_err(|error| format!("failed to build attention tensor: {error}"))?;
        let token_type_ids = token_ids
            .zeros_like()
            .map_err(|error| format!("failed to build token type tensor: {error}"))?;
        let sequence_output = self
            .model
            .forward(&token_ids, &token_type_ids, Some(&attention_mask))
            .map_err(|error| format!("failed to run BGE model: {error}"))?;
        let cls_embedding = sequence_output
            .get(0)
            .and_then(|tensor| tensor.get(0))
            .and_then(|tensor| tensor.to_dtype(DType::F32))
            .and_then(|tensor| tensor.to_vec1::<f32>())
            .map_err(|error| format!("failed to read BGE CLS embedding: {error}"))?;
        normalize_l2(cls_embedding)
    }
}

pub fn build_semantic_query_input(query: &str) -> String {
    format!("{BGE_QUERY_INSTRUCTION}{}", query.trim())
}

pub fn content_embedding_sha256(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn semantic_cache_key(entry_id: &str, content_sha256: &str) -> String {
    format!("{SEMANTIC_MODEL_VERSION}:{entry_id}:{content_sha256}")
}

pub fn normalize_l2(mut vector: Vec<f32>) -> Result<Vec<f32>, String> {
    if vector.is_empty() {
        return Err("cannot normalize an empty semantic vector".to_string());
    }
    let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm <= f32::EPSILON {
        return Err("cannot normalize a zero semantic vector".to_string());
    }
    for value in &mut vector {
        *value /= norm;
    }
    Ok(vector)
}

pub fn cosine_similarity(left: &[f32], right: &[f32]) -> Result<f32, String> {
    if left.len() != right.len() {
        return Err(format!(
            "semantic vector dimensions differ: {} != {}",
            left.len(),
            right.len()
        ));
    }
    if left.is_empty() {
        return Err("cannot compare empty semantic vectors".to_string());
    }
    Ok(left
        .iter()
        .zip(right)
        .map(|(left, right)| left * right)
        .sum())
}

pub fn embedding_to_blob(embedding: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(embedding.len() * std::mem::size_of::<f32>());
    for value in embedding {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

pub fn embedding_from_blob(bytes: &[u8]) -> Result<Vec<f32>, String> {
    if !bytes.len().is_multiple_of(std::mem::size_of::<f32>()) {
        return Err("semantic embedding blob has an invalid byte length".to_string());
    }
    let embedding = bytes
        .chunks_exact(std::mem::size_of::<f32>())
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect::<Vec<_>>();
    if embedding.len() != SEMANTIC_EMBEDDING_DIMS {
        return Err(format!(
            "semantic embedding has {} dimensions, expected {SEMANTIC_EMBEDDING_DIMS}",
            embedding.len()
        ));
    }
    Ok(embedding)
}
