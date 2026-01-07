declare module 'virtual:version' {
  export const version: {
    commit: string;
    short: string;
    branch: string;
    tag: string;
    dirty: boolean;
    buildDate: string;
  };
  export default version;
}
