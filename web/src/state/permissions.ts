import { can, isOfficeRole, type Capability, type Role } from '@pirata/contracts/permissions';
import { useServer } from './serverContext';
export { can, isOfficeRole };
export function useRole():Role|undefined {const {state}=useServer();return state.data?.currentUser?.role;}
/** `useCan('money.costs')` mirrors the server filter; the server remains the guarantee. */
export function useCan(capability:Capability):boolean {return can(useRole(),capability);}
