import {useColorScheme} from '@/hooks/use-color-scheme';
import React,{useContext} from 'react';
import {ProjectPaletteContext} from './ProjectPaletteContext';
import {Pressable,Text,TextInput,View} from 'react-native';
export function TeamButton({label,onPress,disabled=false}: {label:string;onPress:()=>void;disabled?:boolean}) {
  const dark=useColorScheme()==='dark',palette=useContext(ProjectPaletteContext);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={{borderWidth:1,borderColor:palette?.border??'#8B78BA',borderRadius:10,padding:12,opacity:disabled?0.45:1}}><Text style={{color:palette?.accent??(dark?'#C4ADFF':'#6035B0'),fontWeight:'600'}}>{label}</Text></Pressable>;
}
export function TeamInput({label,value,onChange,editable=true,multiline=false,numeric=false}: {label:string;value:string;onChange:(s:string)=>void;editable?:boolean;multiline?:boolean;numeric?:boolean}) {
  const dark=useColorScheme()==='dark',palette=useContext(ProjectPaletteContext);
  return <View style={{gap:5}}><Text style={{color:palette?.text??(dark?'#F0EEFF':'#302341')}}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={editable} multiline={multiline} keyboardType={numeric?'decimal-pad':'default'} placeholderTextColor="#817095" style={{borderWidth:1,borderColor:palette?.border??'#9E93B2',borderRadius:10,padding:12,color:palette?.text??(dark?'#F0EEFF':'#302341'),minHeight:multiline?80:44,opacity:editable?1:0.7}}/></View>;
}
