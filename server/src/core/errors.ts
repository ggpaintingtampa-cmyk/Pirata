import type { ApiFailure } from '@pirata/contracts/index';
export class ApiError extends Error {
  readonly status:number;
  readonly body:ApiFailure;
  constructor(status:number,code:string,message:string,details:Omit<ApiFailure['error'],'code'|'message'>={}) {
    super(message);this.status=status;this.body={error:{code,message,...details}};
  }
}
export function notFound():never {throw new ApiError(404,'NOT_FOUND','Record not found.');}
export function conflict(message:string,code='CONFLICT'):never {throw new ApiError(409,code,message);}
export function invalid(message:string,fields?:Record<string,string>):never {throw new ApiError(400,'INVALID_INPUT',message,{fields});}
export function notImplemented():never {throw new ApiError(501,'NOT_IMPLEMENTED','This module is not implemented yet.');}
