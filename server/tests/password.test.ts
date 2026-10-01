import {expect,it} from 'vitest';
import {hashPassword,verifyPassword} from '../src/auth/password.js';
it('uses verified Argon2id parameters, independent salts and bounded passwords',async()=>{
 const password='test1234';const first=await hashPassword(password),second=await hashPassword(password);
 expect(first.split('$').slice(1,3)).toEqual(['argon2id','v=19']);expect(first.split('$')[3].split(',').sort()).toEqual(['m=19456','p=1','t=2']);expect(first).not.toBe(second);
 expect(await verifyPassword(first,password)).toBe(true);expect(await verifyPassword(first,'wrong-password-value')).toBe(false);
 await expect(hashPassword('1234567')).rejects.toThrow();await expect(hashPassword('x'.repeat(129))).rejects.toThrow();
});
