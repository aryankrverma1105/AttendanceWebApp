import type { Request, Response } from "express";
import prisma from "../config/prisma";
import { userProfileSchema } from "../validations/user.validation";

export async function getProfile(req:Request, res:Response) {
    const {userId, email} = (req as any).user;
    const user = await prisma.user.findUnique({
        where: {
            id: userId,
            email
        },
        select: {
            email: true,
            username: true,
            bio: true,
            createdAt: true,
            updatedAt: true
        }
    })
    if(!user) {
        return res.status(404).json({
            success: false,
            message: "User not found"
        })
    }
    return res.status(200).json({
        success: true,
        message: "Profile fetched successfully",
        user,
    });
}

export async function updateProfile(req: Request, res: Response) {
    const {userId, email} = (req as any).user;
    const {username, bio} = userProfileSchema.parse(req.body);
    const user = await prisma.user.findUnique({
        where: {
            id: userId,
            email
        }
    })
    if(!user) {
        return res.status(404).json({
            success: false,
            message: "User not found"
        })
    }
    const alreadyName = await prisma.user.findUnique({
        where: {
            username
        }
    })
    if(alreadyName && alreadyName.id !== userId) {
        return res.status(400).json({
            success: false,
            message: "Username already exists"
        })
    }
    const updatedUser = await prisma.user.update({
        where: {
            id: userId,
            email
        },
        data: {
            username,
            bio
        },
        select: {
            username: true,
            email: true,
            bio: true,
            createdAt: true,
            updatedAt: true
        }
    })
    return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        updatedUser,
    });
}   