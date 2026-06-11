---
tags:
  - file
  - api
---
### 1. 后端 API 文档: Upload Module
**模块**: `Upload`
**基础路径**: 根据你的 FastAPI 挂载配置（假设挂载在 `/api` 或根路径下，以下均以相对路径表示）。
#### 1.1 上传图片
将图片文件上传至服务器，保存到当前用户的专属目录下，并返回可访问的静态资源 URL。
- **URL**: `/upload`
- **Method**: `POST`
- **Authentication**: Required (依赖 `auth.get_current_user`)
**请求参数 (Request Body - multipart/form-data)**

| **参数名** | **类型** | **必填** | **描述**                                |
| ------- | ------ | ------ | ------------------------------------- |
| `file`  | `File` | 是      | 二进制文件流。建议限制扩展名 (jpg, png, gif, webp)。 |
**响应 (Response)**
- **Status: 200 OK**
    - **Content-Type**: `application/json`
    - **Body**:
        JSON
        ```
          "url": "https://yunazju.fun/bullet-journal/static/uploads/{user_id}/{uuid}.{ext}"
        ```
- **Status: 400 Bad Request** (如果启用了扩展名校验)
    - Detail: "Invalid image type..."
- **Status: 500 Internal Server Error**
    - Detail: "Failed to save file: {error_message}"
