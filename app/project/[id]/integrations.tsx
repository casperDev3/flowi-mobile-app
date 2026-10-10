import { useLocalSearchParams } from 'expo-router';
import { IntegrationsScreen } from '@/components/integrations/IntegrationsScreen';
export default function Screen() { const {id}=useLocalSearchParams<{id:string}>(); return <IntegrationsScreen key={id} projectId={id}/>; }
