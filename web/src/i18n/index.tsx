import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useServer } from '../state/serverContext';
import { shellStrings } from './shell';
export type Locale='en'|'es';
export type Strings={en:Record<string,string>;es:Record<string,string>};
/** Every feature folder may export `strings` from a strings.ts; keys are `namespace.key`. */
const featureStrings=import.meta.glob('../features/*/strings.ts',{eager:true,import:'strings'}) as Record<string,Strings|undefined>;
const dictionaries:Record<Locale,Record<string,string>>={en:{...shellStrings.en},es:{...shellStrings.es}};
for(const strings of Object.values(featureStrings)){if(!strings)continue;Object.assign(dictionaries.en,strings.en);Object.assign(dictionaries.es,strings.es);}
export function detectLocale():Locale {
  try{return typeof navigator!=='undefined'&&(navigator.language??'').toLowerCase().startsWith('es')?'es':'en';}catch{return 'en';}
}
/** Missing keys fall back to English, then to the key itself. `{name}` placeholders are replaced from vars. */
export function translate(locale:Locale,key:string,vars?:Record<string,string|number>):string {
  const raw=dictionaries[locale][key]??dictionaries.en[key]??key;
  return vars?raw.replace(/\{(\w+)\}/g,(_,name:string)=>String(vars[name]??'')):raw;
}
const LocaleContext=createContext<Locale>('en');
export function LocaleProvider({children,locale}:{children:ReactNode;locale?:Locale}) {
  const {state}=useServer();
  const value=locale??(state.data?.currentUser?.locale as Locale|undefined)??detectLocale();
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale():Locale {return useContext(LocaleContext);}
export function useT() {
  const locale=useLocale();
  return useMemo(()=>(key:string,vars?:Record<string,string|number>)=>translate(locale,key,vars),[locale]);
}
export const LOCALE_NAMES:Record<Locale,string>={en:'English',es:'Español'};
