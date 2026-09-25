import { can, isOfficeRole, type Capability, type Role } from '@pirata/contracts/permissions';
import { useContext } from 'react';
import { ServerContext } from './serverContext';
export { can, isOfficeRole };
/** Outside the live ServerProvider (isolated module harness, demo) there is no signed-in role: capabilities read as denied. */
export function useRole():Role|undefined {return useContext(ServerContext)?.state.data?.currentUser?.role;}
/** `useCan('money.costs')` mirrors the server filter; the server remains the guarantee. */
export function useCan(capability:Capability):boolean {return can(useRole(),capability);}
