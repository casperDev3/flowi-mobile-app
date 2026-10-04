import {createContext} from 'react';
export const ProjectPaletteContext=createContext<{text:string;sub:string;accent:string;border:string;dim:string}|null>(null);
