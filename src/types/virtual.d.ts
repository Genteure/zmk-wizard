declare module 'virtual:version' {
  export const version: {
    commit: string;
    short: string;
    branch: string;
    tag: string;
    dirty: boolean;
    generatedAt: string;
  };
  export default version;
}
