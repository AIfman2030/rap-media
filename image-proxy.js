// 图片生成代理 - 支持多 provider：RightCode、Agnes AI
// Agnes AI 兼容 OpenAI 格式，免费额度

async function handleDrawImageRequest(req, res, url) {
  try {
    if (req.method !== "POST" || url.pathname !== "/api/draw-image") {
      return sendJson(res, 404, { error: "Not found." });
    }

    const body = await readJsonBody(req);
    const provider = String(body.provider || "rightcode").toLowerCase();
    const apiKey = String(body.apiKey || body.api_key || "").trim();
    const prompt = String(body.prompt || "").trim();

    if (!apiKey) {
      return sendJson(res, 400, { error: `Missing API key for provider: ${provider}.` });
    }
    if (!prompt) {
      return sendJson(res, 400, { error: "Missing prompt." });
    }

    const result = await generateImage(prompt, provider, apiKey);
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Internal server error" });
  }
}

// 统一的图片生成入口，根据 provider 分发
async function generateImage(prompt, provider, apiKey) {
  if (provider === "agnes") {
    return generateImageAgnes(prompt, apiKey);
  }
  // 默认 RightCode
  return generateImageRightCode(prompt, apiKey);
}

// Right Code（gpt-image-2）
async function generateImageRightCode(prompt, apiKey) {
  const response = await fetch("https://www.right.codes/draw/v1/images/generations", {
    method: "POST",
    headers: imageHeaders(apiKey),
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      size: "1536x864",
      response_format: "url"
    })
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`RightCode failed: ${describeResponseError(response, data)}`);
  }

  const normalized = await normalizeImageResponse(data, apiKey);
  if (normalized) return normalized;
  throw new Error(`RightCode unexpected response: ${summarizeJson(data)}`);
}

// Agnes AI（OpenAI 兼容格式，16:9 画面，Agnes 会自动匹配分辨率档位）
async function generateImageAgnes(prompt, apiKey) {
  const response = await fetch("https://apihub.agnes-ai.com/v1/images/generations", {
    method: "POST",
    headers: imageHeaders(apiKey),
    body: JSON.stringify({
      model: "agnes-image-2.1-flash",
      prompt,
      size: "1280x720",
      n: 1
    })
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`Agnes AI failed: ${describeResponseError(response, data)}`);
  }

  const normalized = await normalizeImageResponse(data, apiKey);
  if (normalized) return normalized;
  throw new Error(`Agnes AI unexpected response: ${summarizeJson(data)}`);
}

// 从响应中提取图片（支持 URL 或 base64）
async function normalizeImageResponse(data, apiKey) {
  const asset = extractImageAsset(data);
  if (!asset) return null;

  if (asset.imageDataUrl) {
    return {
      ...asset,
      imageDataUrl: normalizeDataUrl(asset.imageDataUrl),
      status: "ready"
    };
  }

  if (!asset.imageUrl) return null;

  // Agnes 返回的 URL 是公开可访问的 CDN 地址，不带认证头
  const imgResponse = await fetch(asset.imageUrl);
  if (!imgResponse.ok) {
    throw new Error(`Image download failed: ${imgResponse.status} ${imgResponse.statusText}`);
  }

  const contentType = imgResponse.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await imgResponse.arrayBuffer());
  return {
    ...asset,
    imageUrl: asset.imageUrl,
    imageDataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
    status: "ready"
  };
}

// 提取响应中的图片字段（支持多种格式）
function extractImageAsset(data) {
  const list = normalizeList(data);
  const item = list.find((entry) =>
    Boolean(
      entry?.b64_json ||
        entry?.base64 ||
        entry?.imageDataUrl ||
        entry?.dataUrl ||
        entry?.image_base64 ||
        entry?.url ||
        entry?.image_url ||
        entry?.imageUrl ||
        entry?.image
    )
  );
  if (!item) return null;

  return {
    imageUrl: item.url || item.image_url || item.imageUrl || item.image || "",
    imageDataUrl:
      item.b64_json || item.base64 || item.imageDataUrl || item.dataUrl || item.image_base64 || "",
    taskId: item.id || item.task_id || item.taskId || ""
  };
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.data)) return data.data.data;
  if (Array.isArray(data?.data?.images)) return data.data.images;
  if (Array.isArray(data?.images)) return data.images;
  if (Array.isArray(data?.output)) return data.output;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.result?.images)) return data.result.images;
  if (Array.isArray(data?.result?.output)) return data.result.output;
  if (Array.isArray(data?.data?.output)) return data.data.output;
  if (data?.data && typeof data.data === "object") return [data.data];
  if (data?.result && typeof data.result === "object") return [data.result];
  return data ? [data] : [];
}

function imageHeaders(apiKey) {
  const token = String(apiKey).trim();
  return {
    "Content-Type": "application/json",
    Authorization: token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`,
    "x-api-key": token
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function describeResponseError(response, data) {
  const bodyValue = data?.error || data?.message || data?.msg || data;
  const body =
    typeof bodyValue === "string"
      ? bodyValue
      : bodyValue
        ? JSON.stringify(bodyValue)
        : "";
  return `${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`;
}

function summarizeJson(data) {
  const text = JSON.stringify(data);
  return text.length > 420 ? `${text.slice(0, 420)}...` : text;
}

function normalizeDataUrl(value) {
  if (!value || typeof value !== "string") return "";
  if (value.startsWith("data:image/")) return value;
  return `data:image/png;base64,${value}`;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  res.end(JSON.stringify(data));
}

module.exports = {
  handleDrawImageRequest
};
