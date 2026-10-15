import { createBrowserHistory } from "history";
// 检查是否为开发环境
const isDevelopment = process.env.NODE_ENV === 'development';
if (isDevelopment) {
  (window as any).KbAPI = '/mx-warehouse/kb';
}
console.log('historyKbAPI', (window as any).KbAPI)
const history = createBrowserHistory({
  basename: `${(window as any).KbAPI || ''}`,
});

export default history;
