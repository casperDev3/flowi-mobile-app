import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;
async function render(element: React.ReactElement) { let tree: any; await act(async()=>{tree=create(element);}); return tree; }
async function press(tree: any, label: string) { const node=tree.root.findAll((n:any)=>n.props.accessibilityRole==='button' && typeof n.props.onPress==='function').find((n:any)=>n.findAll((c:any)=>c.props.children===label).length); await act(async()=>{node.props.onPress();}); }
import { IntegrationsScreen } from '../components/integrations/IntegrationsScreen';
import { apiFetch } from '../store/api';
jest.mock('../store/api',()=>({apiFetch:jest.fn()}));
const api=apiFetch as jest.Mock;
const listing={can_manage:true,connections:[],providers:[{id:'trello',label:'Trello',kind:'tasks',fields:['key','token']},{id:'google',label:'Google Calendar',kind:'calendar',fields:[]}]};
beforeEach(()=>{api.mockReset();api.mockResolvedValue(listing);});
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
 const screen=await render(<IntegrationsScreen/>);
 await press(screen,'Trello');
 await act(async()=>{screen.root.findByProps({accessibilityLabel:'Ключ API'}).props.onChangeText('test-key');});
 await act(async()=>{screen.root.findByProps({accessibilityLabel:'Токен доступу'}).props.onChangeText('test-token');});
 expect(screen.root.findByProps({accessibilityLabel:'Токен доступу'}).props.secureTextEntry).toBe(true);
 await press(screen,'Підключити');
 expect(api).toHaveBeenCalledWith('/integrations/',{method:'POST',body:{provider:'trello',credentials:{key:'test-key',token:'test-token'},project:undefined}});
 expect(screen.root.findAllByProps({accessibilityLabel:'Токен доступу'})).toHaveLength(0);
 await act(async()=>screen.unmount());
});
