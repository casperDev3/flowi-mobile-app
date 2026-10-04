export type ProjectPalette = { background:string; surface:string; accent:string };
export type ProjectAppearance = { light:ProjectPalette; dark:ProjectPalette };
export const DEFAULT_APPEARANCE:ProjectAppearance = {
  light:{background:'#f7f8fa',surface:'#ffffff',accent:'#7c3aed'},
  dark:{background:'#0f1117',surface:'#1a1e2a',accent:'#a78bfa'},
};
export const validColor=(value:unknown):value is string=>typeof value==='string'&&/^#[\da-f]{6}$/i.test(value);
export function projectAppearance(value?:Partial<ProjectAppearance>):ProjectAppearance {
  const palette=(mode:'light'|'dark')=>Object.fromEntries(Object.entries(DEFAULT_APPEARANCE[mode]).map(([key,fallback])=>[key,validColor(value?.[mode]?.[key as keyof ProjectPalette])?value![mode]![key as keyof ProjectPalette]:fallback])) as ProjectPalette;
  return {light:palette('light'),dark:palette('dark')};
}
function channels(color:string){return [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));}
export function luminance(color:string){return channels(color).map(v=>{const c=v/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
export function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function readableText(background:string){return contrast(background,'#ffffff')>=contrast(background,'#000000')?'#ffffff':'#000000';}
function mix(a:string,b:string,amount:number){const x=channels(a),y=channels(b);return '#'+x.map((v,i)=>Math.round(v*(1-amount)+y[i]*amount).toString(16).padStart(2,'0')).join('');}
/** Only colors validated as HEX reach CSS. Text is derived for readable contrast. */
export function appearanceTokens(palette:ProjectPalette):Record<string,string> {
  const {background,surface,accent}=palette,text=readableText(surface),soft=mix(surface,accent,.12);
  return {'--flowi-bg-1':background,'--flowi-bg-2':background,'--background':background,
    '--flowi-panel':surface,'--flowi-panel-solid':surface,'--flowi-panel-soft':surface,'--flowi-input':surface,
    '--flowi-text':text,'--foreground':text,'--flowi-muted':mix(surface,text,.68),'--flowi-dim':mix(surface,text,.07),'--flowi-raised':mix(surface,text,.04),'--flowi-border':mix(surface,text,.2),
    '--primary':accent,'--primary-light':accent,'--primary-dark':contrast(accent,soft)>=4.5?accent:readableText(soft),
    '--primary-light-soft':soft,'--secondary':accent,'--accent':accent,'--accent-light':accent,'--accent-dark':accent,'--on-accent':readableText(accent)};
}
