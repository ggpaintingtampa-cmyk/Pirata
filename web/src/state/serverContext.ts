import { createContext, useContext } from 'react';
import type { ServerState, ServerStore } from './serverStore';
export const ServerContext=createContext<{store:ServerStore;state:ServerState;now:number}|null>(null);
export function useServer(){const context=useContext(ServerContext);if(!context)throw new Error('Server provider missing');return context;}
