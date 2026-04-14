import axios from "axios";

const INFO_CHECK_URL = process.env.INFO_CHECK_URL || "";
const INFO_CHECK_TIMEOUT = Number(process.env.INFO_CHECK_TIMEOUT || 10000);

function getRequestInput(req) {
  return {
    ...(req.query || {}),
    ...(req.body || {}),
  };
}

function normalizeArrayLikeField(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return value;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
}

function normalizeInfoCheckInput(input = {}) {
  return {
    ...input,
    _encrypted_fields: normalizeArrayLikeField(input?._encrypted_fields),
  };
}

function getInfoCheckPayload(req, options = {}) {
  const rawInput = getRequestInput(req);
  const input = normalizeInfoCheckInput(rawInput);
  const appKey = input?.appKey ?? input?.appName ?? "";
  const colaKey = input?.ColaKey ?? input?.colaKey ?? "";
  const userid = typeof input?.userid === "string" ? input.userid : "";
  const username = typeof input?.username === "string" ? input.username : "";
  const cuid = input?.cuid ?? 0;
  const useNoMemberLimit = Boolean(options.useNoMemberLimit);

  return {
    ...input,
    appKey,
    userid,
    username,
    cuid,
    colaKey,
    useNoMemberLimit,
  };
}

function getForwardHeaders(req) {
  const headers = {
    "Content-Type": "application/json",
  };

  const origin = req.headers?.origin;
  const referer = req.headers?.referer;
  const userAgent = req.headers?.["user-agent"];
  const forwardedFor = req.headers?.["x-forwarded-for"];
  const realIp = req.headers?.["x-real-ip"];

  if (typeof origin === "string" && origin) {
    headers.Origin = origin;
  }
  if (typeof referer === "string" && referer) {
    headers.Referer = referer;
  }
  if (typeof userAgent === "string" && userAgent) {
    headers["User-Agent"] = userAgent;
  }
  if (typeof forwardedFor === "string" && forwardedFor) {
    headers["X-Forwarded-For"] = forwardedFor;
  }
  if (typeof realIp === "string" && realIp) {
    headers["X-Real-IP"] = realIp;
  }

  return headers;
}

export async function infoCheckHandle(req, options = {}) {
  if (!INFO_CHECK_URL) {
    throw new Error("缺少 INFO_CHECK_URL 配置");
  }

  const payload = getInfoCheckPayload(req, options);
  const response = await axios.post(INFO_CHECK_URL, payload, {
    timeout: INFO_CHECK_TIMEOUT,
    headers: getForwardHeaders(req),
  });

  return response.data;
}

export function normalizeInfoCheckError(error) {
  if (error?.response?.data && typeof error.response.data === "object") {
    return error.response.data;
  }

  return {
    code: -999,
    msg: error?.message || "参数校验失败",
    data: {},
  };
}

export function createInfoCheckMiddleware(options = {}) {
  return async function infoCheckMiddleware(req, res, next) {
    try {
      const infoCheckResult = await infoCheckHandle(req, options);
      if (infoCheckResult?.code !== 0) {
        res.status(200).json(infoCheckResult);
        return;
      }
      next();
    } catch (error) {
      res.status(200).json(normalizeInfoCheckError(error));
    }
  };
}
