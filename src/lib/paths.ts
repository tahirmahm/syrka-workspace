export const WORKSPACE_BASE_PATH='/workspace';
export function workspacePath(path='/'){return `${WORKSPACE_BASE_PATH}${path==='/'?'':path.startsWith('/')?path:`/${path}`}`;}
