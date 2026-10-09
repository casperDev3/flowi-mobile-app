import {useEffect} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useAuth} from '@/store/auth';
import {useI18n} from '@/store/i18n';
import {loadData} from '@/store/storage';
import {isLead,type TeamPreferences,type TeamRole} from '@/utils/teamwork';

export default function ProjectEntry() {
  const {id}=useLocalSearchParams<{id:string}>(),router=useRouter(),{user}=useAuth(),{tr}=useI18n();
  useEffect(()=>{
    let active=true;
    // Read membership before choosing a landing page: the role hook's owner
    // fallback is only provisional during a cold application start.
    void Promise.all([
      loadData<TeamPreferences[]>('team_preferences',[]),
      loadData<Record<string,{role:TeamRole}>>('project_sync_state_v1',{}),
      loadData<{id:string;role:TeamRole}[]>('workspace_projects',[]),
    ]).then(([preferences,state,projects])=>{
      if(!active)return;
      const role=state[id]?.role??projects.find(p=>p.id===id)?.role??'owner';
      const home=preferences.find(p=>p.projectId===id&&p.userId===String(user?.id))?.homePage??(isLead(role)?'overview':'my-work');
      router.replace(`/project/${encodeURIComponent(id)}/${home}` as never);
    });
    return()=>{active=false;};
  },[id,user?.id,router]);
  return <View style={{flex:1,justifyContent:'center'}}><ActivityIndicator accessibilityLabel={tr.projectOpeningA11y}/></View>;
}
