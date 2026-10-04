import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
const mockReplace=jest.fn();
const mockRouter={replace:mockReplace};
let mockRole='member';
let mockHome:string|undefined;
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({id:'p'}),useRouter:()=>mockRouter}));
jest.mock('@/store/auth',()=>({useAuth:()=>({user:{id:'u'}})}));
jest.mock('@/store/storage',()=>({loadData:async(key:string)=>{
  if(key==='team_preferences')return mockHome?[{projectId:'p',userId:'u',homePage:mockHome}]:[];
  if(key==='project_sync_state_v1')return {p:{role:mockRole}};
  return [{id:'p',role:'owner'}]; // stale list must not override synced role
}}));
import ProjectEntry from '../app/project/[id]/index';
it.each([['member',undefined,'my-work'],['viewer',undefined,'my-work'],['manager',undefined,'overview'],['manager','my-work','my-work']])('cold landing respects %s and preference %s',async(role,home,target)=>{
  mockRole=role!;mockHome=home;mockReplace.mockClear();
  let tree:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(<ProjectEntry/>);});
  expect(mockReplace).toHaveBeenCalledWith(`/project/p/${target}`);
  await act(async()=>tree!.unmount());
});
