import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;
async function render(element: React.ReactElement) { let tree: any; await act(async()=>{tree=create(element);}); return tree; }
async function press(tree: any, label: string) { const node=tree.root.findAll((n:any)=>n.props.accessibilityRole==='button' && typeof n.props.onPress==='function').find((n:any)=>n.findAll((c:any)=>c.props.children===label).length); await act(async()=>{node.props.onPress();}); }
import { IntegrationsScreen } from '../components/integrations/IntegrationsScreen';
import { apiFetch, ApiError } from '../store/api';
import { allTranslations } from '../store/translations';
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}), multiGet: jest.fn(async () => []), getAllKeys: jest.fn(async () => []) } }));
jest.mock('../store/api',()=>{class ApiError extends Error{status:number;code:string;details?:Record<string,unknown>;constructor(status:number,code:string,message:string,details?:Record<string,unknown>){super(message);this.name='ApiError';this.status=status;this.code=code;this.details=details;}}return {apiFetch:jest.fn(),ApiError};});
const mockPush=jest.fn(),mockReplace=jest.fn();
jest.mock('expo-router',()=>({router:{push:(...args:unknown[])=>mockPush(...args),replace:(...args:unknown[])=>mockReplace(...args)},useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:24,bottom:0,left:0,right:0})}));
const api=apiFetch as jest.Mock;
const listing={can_manage:true,connections:[],providers:[{id:'worksection',label:'Worksection',kind:'tasks',fields:['host','key']},{id:'trello',label:'Trello',kind:'tasks',fields:['key','token']},{id:'google',label:'Google Calendar',kind:'calendar',fields:[]}]};
beforeEach(()=>{mockPush.mockReset();mockReplace.mockReset();api.mockReset();api.mockResolvedValue(listing);});
it('scopes the API to the project and hides management from members',async()=>{
 api.mockResolvedValue({...listing,can_manage:false});
 const screen=await render(<IntegrationsScreen projectId="project-a"/>);
 expect(api).toHaveBeenCalledWith('/integrations/?project=project-a');
 expect(JSON.stringify(screen.toJSON())).toContain('Підключень поки немає.');
 expect(JSON.stringify(screen.toJSON())).not.toContain('Нове підключення');
});
it('submits credentials as an object and clears the secret after connecting',async()=>{
 api.mockImplementation(async(path:string,options?:{method?:string})=>{
  if(path.endsWith('/sources/'))return {sources:[]};
  if(options?.method==='POST')return {id:'connection',provider:'trello',label:'Trello',sources:[],state:'draft'};
  return listing;
 });
 const screen=await render(<IntegrationsScreen mode="settings"/>);
 await press(screen,'Trello');
 await act(async()=>{screen.root.findByProps({accessibilityLabel:'Ключ API'}).props.onChangeText('test-key');});
 await act(async()=>{screen.root.findByProps({accessibilityLabel:'Токен доступу'}).props.onChangeText('test-token');});
 expect(screen.root.findByProps({accessibilityLabel:'Токен доступу'}).props.secureTextEntry).toBe(true);
 await press(screen,'Підключити');
 expect(api).toHaveBeenCalledWith('/integrations/',{method:'POST',body:{provider:'trello',label:'Trello',credentials:{key:'test-key',token:'test-token'},project:undefined}});
 expect(screen.root.findAllByProps({accessibilityLabel:'Токен доступу'})).toHaveLength(0);
 await act(async()=>screen.unmount());
});

it.each([undefined,'project-a'])('opens settings and returns within the same scope: %s',async(projectId)=>{
 const base=projectId?`/project/${projectId}/integrations`:'/integrations';
 const overview=await render(<IntegrationsScreen projectId={projectId}/>);
 expect(JSON.stringify(overview.toJSON())).not.toContain('Нове підключення');
 await press(overview,'Підключити сервіс');
 expect(mockPush).toHaveBeenCalledWith(`${base}/settings`);
 await act(async()=>overview.unmount());
 const settings=await render(<IntegrationsScreen projectId={projectId} mode="settings"/>);
 expect(JSON.stringify(settings.toJSON())).toContain('Нове підключення');
 await press(settings,'← До інтеграцій');
 expect(mockReplace).toHaveBeenCalledWith(base);
 await act(async()=>settings.unmount());
});
it('settings remain read-only for a project member',async()=>{
 api.mockResolvedValue({...listing,can_manage:false});
 const screen=await render(<IntegrationsScreen projectId="project-a" mode="settings"/>);
 expect(JSON.stringify(screen.toJSON())).not.toContain('Нове підключення');
 expect(JSON.stringify(screen.toJSON())).toContain('Налаштування доступні власнику або менеджеру проєкту.');
 await act(async()=>screen.unmount());
});


it('connects Worksection from native settings and clears the API key', async () => {
 api.mockImplementation(async (path:string, options?:{method?:string}) => {
  if(path.endsWith('/sources/')) return {sources:[]};
  if(options?.method==='POST') return {id:'ws',provider:'worksection',label:'Worksection',sources:[],state:'draft'};
  return listing;
 });
 const screen=await render(<IntegrationsScreen mode="settings"/>);
 await press(screen,'Worksection');
 await act(async()=>{
  screen.root.findByProps({accessibilityLabel:'Адреса сервісу'}).props.onChangeText('https://qa.worksection.com');
  screen.root.findByProps({accessibilityLabel:'Ключ API'}).props.onChangeText('test-key');
 });
 await press(screen,'Підключити');
 expect(api).toHaveBeenCalledWith('/integrations/',{method:'POST',body:{provider:'worksection',label:'Worksection',credentials:{host:'https://qa.worksection.com',key:'test-key'},project:undefined}});
 expect(screen.root.findAllByProps({accessibilityLabel:'Ключ API'})).toHaveLength(0);
 await act(async()=>screen.unmount());
});

it('shows a localized message instead of HTTP 400 when the host is rejected', async () => {
 api.mockImplementation(async (_path:string, options?:{method?:string}) => {
  if(options?.method==='POST') throw new ApiError(400,'invalid_provider_host','HTTP 400',{code:'invalid_provider_host'});
  return listing;
 });
 const screen=await render(<IntegrationsScreen mode="settings"/>);
 await press(screen,'Worksection');
 const host=screen.root.findByProps({accessibilityLabel:'Адреса сервісу'});
 expect(host.props.keyboardType).toBe('url');
 expect(host.props.placeholder).toBe('https://company.worksection.com');
 await act(async()=>{
  screen.root.findByProps({accessibilityLabel:allTranslations.uk.integrationForm.connectionLabel}).props.onChangeText('  Команда  ');
  host.props.onChangeText('bad host');
  screen.root.findByProps({accessibilityLabel:'Ключ API'}).props.onChangeText('test-key');
 });
 await press(screen,'Підключити');
 expect(api).toHaveBeenCalledWith('/integrations/',{method:'POST',body:{provider:'worksection',label:'Команда',credentials:{host:'bad host',key:'test-key'},project:undefined}});
 const alert=screen.root.findAll((n:any)=>n.props.accessibilityRole==='alert')[0];
 const text=JSON.stringify(alert.props.children);
 expect(text).toContain(allTranslations.uk.integrationErrors.invalid_provider_host.replace('{example}','https://company.worksection.com'));
 expect(JSON.stringify(screen.toJSON())).not.toContain('HTTP 400');
 expect(screen.root.findAllByProps({accessibilityLabel:'Ключ API'}).length).toBeGreaterThan(0);
 await act(async()=>screen.unmount());
});

it('shows the localized connection error code', async () => {
 api.mockResolvedValue({...listing,connections:[{id:'c1',label:'WS',provider:'worksection',state:'attention',error_code:'access_denied',last_success:null,sources:[]}]});
 const screen=await render(<IntegrationsScreen/>);
 expect(JSON.stringify(screen.toJSON())).toContain(allTranslations.uk.integrationErrors.access_denied);
 await act(async()=>screen.unmount());
});

it('reconnect keeps the custom connection label (server stores it, S8)', async () => {
 const existing={id:'c1',provider:'trello',label:'Команда Trello',sources:[],state:'error',error_code:'access_denied'};
 api.mockImplementation(async (path:string, options?:{method?:string}) => {
  if(path.endsWith('/sources/')) return {sources:[]};
  if(options?.method==='POST') return existing;
  return {...listing,connections:[existing]};
 });
 const screen=await render(<IntegrationsScreen mode="settings"/>);
 await press(screen,'Відновити доступ');
 expect(screen.root.findByProps({accessibilityLabel:allTranslations.uk.integrationForm.connectionLabel}).props.value).toBe('Команда Trello');
 await act(async()=>{
  screen.root.findByProps({accessibilityLabel:'Ключ API'}).props.onChangeText('k');
  screen.root.findByProps({accessibilityLabel:'Токен доступу'}).props.onChangeText('t');
 });
 await press(screen,'Підключити');
 expect(api).toHaveBeenCalledWith('/integrations/c1/reconnect/',{method:'POST',body:{provider:'trello',label:'Команда Trello',credentials:{key:'k',token:'t'},project:undefined}});
 await act(async()=>screen.unmount());
});
