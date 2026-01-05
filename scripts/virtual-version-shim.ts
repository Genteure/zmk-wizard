const commit = process.env.GITHUB_SHA || process.env.VERSION || "dev";
const short = (process.env.GITHUB_SHA || process.env.VERSION || "dev").slice(0, 10);
const branch = process.env.GITHUB_REF_NAME || process.env.BRANCH_NAME || "";
const tag = process.env.GITHUB_REF_TYPE === "tag"
  ? (process.env.GITHUB_REF_NAME || "")
  : (process.env.GITHUB_TAG_NAME || "");
const dirty = (process.env.GITHUB_DIRTY || "").toLowerCase() === "true";
const buildDate = process.env.BUILD_DATE || new Date().toISOString();

export const version = { commit, short, branch, tag, dirty, buildDate };
export default version;
