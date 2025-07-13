import crypto from 'crypto'
import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { Error as MongooseError } from 'mongoose'

import { REFRESH_TOKEN } from '../config'
import BadRequestError from '../errors/bad-request-error'
import ConflictError from '../errors/conflict-error'
import NotFoundError from '../errors/not-found-error'
import UnauthorizedError from '../errors/unauthorized-error'
import User from '../models/user'

// POST /auth/login
const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body
        const user = await User.findUserByCredentials(email, password)
        const accessToken = user.generateAccessToken()
        const refreshToken = await user.generateRefreshToken()

        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        )

        res.json({
            success: true,
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                roles: user.roles,
            },
            accessToken,
        })
    } catch (err) {
        next(err)
    }
}

// POST /auth/register
const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password, name } = req.body
        const user = await new User({ email, password, name }).save()

        const accessToken = user.generateAccessToken()
        const refreshToken = await user.generateRefreshToken()

        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        )

        res.status(constants.HTTP_STATUS_CREATED).json({
            success: true,
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                roles: user.roles,
            },
            accessToken,
        })
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (error instanceof Error && error.message.includes('E11000')) {
            return next(
                new ConflictError('Пользователь с таким email уже существует')
            )
        }
        return next(error)
    }
}

// GET /auth/user
const getCurrentUser = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = res.locals.user._id
        const user = await User.findById(userId).orFail(
            () => new NotFoundError('Пользователь по заданному id отсутствует в базе')
        )

        res.json({
            success: true,
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                roles: user.roles,
            },
        })
    } catch (error) {
        next(error)
    }
}

// Логика удаления refresh токена из пользователя
const deleteRefreshTokenInUser = async (
    req: Request,
    _res: Response,
    _next: NextFunction
) => {
    const { cookies } = req
    const rfTkn = cookies[REFRESH_TOKEN.cookie.name]

    if (!rfTkn) {
        throw new UnauthorizedError('Не валидный токен')
    }

    const decoded = jwt.verify(rfTkn, REFRESH_TOKEN.secret) as JwtPayload

    const user = await User.findOne({ _id: decoded._id }).orFail(() =>
        new UnauthorizedError('Пользователь не найден в базе')
    )

    const rTknHash = crypto
        .createHmac('sha256', REFRESH_TOKEN.secret)
        .update(rfTkn)
        .digest('hex')

    user.tokens = user.tokens.filter((tokenObj) => tokenObj.token !== rTknHash)
    await user.save()

    return user
}

// GET /auth/logout
const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await deleteRefreshTokenInUser(req, res, next)

        res.cookie(REFRESH_TOKEN.cookie.name, '', {
            ...REFRESH_TOKEN.cookie.options,
            maxAge: -1,
        })

        res.status(200).json({ success: true })
    } catch (error) {
        next(error)
    }
}

// POST /auth/token
const refreshAccessToken = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = await deleteRefreshTokenInUser(req, res, next)
        const accessToken = user.generateAccessToken()
        const refreshToken = await user.generateRefreshToken()

        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        )

        res.json({
            success: true,
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                roles: user.roles,
            },
            accessToken,
        })
    } catch (error) {
        next(error)
    }
}

// GET /auth/user/roles
const getCurrentUserRoles = async (
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user._id
        await User.findById(userId).orFail(
            () => new NotFoundError('Пользователь по заданному id отсутствует в базе')
        )
        res.status(200).json(res.locals.user.roles)
    } catch (error) {
        next(error)
    }
}

// PATCH /auth/user
const updateCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    const name = typeof req.body.name === 'string' ? req.body.name : undefined
    const email = typeof req.body.email === 'string' ? req.body.email : undefined

    try {
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { name, email },
            { new: true, runValidators: true }
        ).orFail(() =>
            new NotFoundError('Пользователь по заданному id отсутствует в базе')
        )

        res.status(200).json({
            _id: updatedUser._id,
            email: updatedUser.email,
            name: updatedUser.name,
            roles: updatedUser.roles,
        })
    } catch (error) {
        next(error)
    }
}

export {
    login,
    register,
    logout,
    refreshAccessToken,
    getCurrentUser,
    getCurrentUserRoles,
    updateCurrentUser,
}
