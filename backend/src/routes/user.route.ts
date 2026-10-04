import express from "express"
import { authorized } from "../middleware/auth.middleware"
import { getProfile, updateProfile } from "../controllers/user.controller"

const userRoute = express.Router();

/**
 * @route GET /me
 * @description Get user profile
 * @access Private
 * @returns {user: {id, email, name}}
 */
userRoute.get("/me", authorized, getProfile)

userRoute.patch("/me", authorized, updateProfile)

export default userRoute;