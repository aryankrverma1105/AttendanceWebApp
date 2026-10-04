import bcrypt from "bcryptjs";

async function hashPassword(password:string) {
    return await bcrypt.hash(password,12);
}

async function comparePassword(password:string, hash:string) {
    return await bcrypt.compare(password, hash);
}

export {
    hashPassword,
    comparePassword
}