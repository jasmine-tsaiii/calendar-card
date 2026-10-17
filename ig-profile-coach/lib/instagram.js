// 透過 Meta 官方 Instagram Graph API「Business Discovery」讀取「單一」專業帳號的公開資料。
// 只在使用者貼上連結時查詢一次，不做批量爬取，也不儲存結果。

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";
const RECENT_POSTS = 9;      // 九宮格
const MAX_IMAGES = 7;        // 大頭貼 + 最近 6 則貼文的圖，給 AI 看視覺一致性
const RESERVED_PATHS = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "tv", "direct"]);

export class ProfileError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function parseInstagramUsername(input) {
  const text = input.trim();
  if (/^@?[A-Za-z0-9._]{1,30}$/.test(text)) return text.replace(/^@/, "");

  let url;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!/(^|\.)instagram\.com$/.test(url.hostname) && url.hostname !== "instagr.am") return null;

  const first = url.pathname.split("/").filter(Boolean)[0];
  if (!first || RESERVED_PATHS.has(first.toLowerCase())) return null;
  return /^[A-Za-z0-9._]{1,30}$/.test(first) ? first : null;
}

export async function fetchInstagramProfile(username) {
  const token = process.env.META_ACCESS_TOKEN;
  const igUserId = process.env.META_IG_USER_ID;
  if (!token || !igUserId) {
    throw new ProfileError("尚未設定 Meta API 金鑰，暫時無法自動讀取，請改用截圖分析。", 503);
  }

  const fields =
    `business_discovery.username(${username}){` +
    "username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count," +
    `media.limit(${RECENT_POSTS}){caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count}` +
    "}";
  const endpoint = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}`);
  endpoint.searchParams.set("fields", fields);
  endpoint.searchParams.set("access_token", token);

  const res = await fetch(endpoint);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw toProfileError(body.error, res.status);
  }

  const d = body.business_discovery;
  const posts = (d.media?.data ?? []).map((m) => ({
    caption: m.caption ?? "",
    type: m.media_type,
    imageUrl: m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url,
    permalink: m.permalink,
    timestamp: m.timestamp,
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
  }));

  return {
    source: "instagram_business_discovery",
    username: d.username,
    name: d.name ?? "",
    biography: d.biography ?? "",
    website: d.website ?? "",
    followers: d.followers_count ?? null,
    following: d.follows_count ?? null,
    mediaCount: d.media_count ?? null,
    profilePictureUrl: d.profile_picture_url ?? null,
    posts,
    images: await downloadImages([d.profile_picture_url, ...posts.map((p) => p.imageUrl)]),
  };
}

function toProfileError(error, status) {
  const msg = error?.message ?? "";
  // 個人帳號、不存在的帳號、未滿 18 歲限制的帳號都會在這裡失敗
  if (error?.code === 110 || /cannot be found|Invalid user id|does not exist/i.test(msg)) {
    return new ProfileError(
      "讀不到這個帳號。官方 API 只能讀取「專業帳號（商業／創作者）」，個人帳號請改用截圖分析。",
      404,
    );
  }
  if (error?.code === 190) {
    return new ProfileError("Meta API 金鑰已過期，請管理員更新 META_ACCESS_TOKEN。", 503);
  }
  if (error?.code === 4 || error?.code === 17 || error?.code === 32) {
    return new ProfileError("查詢次數已達 Meta 上限，請稍後再試，或先改用截圖分析。", 429);
  }
  console.error("Graph API error", status, error);
  return new ProfileError("讀取 IG 資料時發生錯誤，請改用截圖分析。", 502);
}

// 把圖片下載成 base64 交給 Claude；IG CDN 連結會過期，所以不直接傳網址
async function downloadImages(urls) {
  const picked = urls.filter(Boolean).slice(0, MAX_IMAGES);
  const results = await Promise.all(
    picked.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const mediaType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
        if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) return null;
        const data = Buffer.from(await res.arrayBuffer()).toString("base64");
        return { mediaType, data };
      } catch {
        return null;
      }
    }),
  );
  return results.filter(Boolean);
}
