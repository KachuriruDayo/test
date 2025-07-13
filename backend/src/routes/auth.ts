import { Router } from 'express'
import {
    getCurrentUser,
    getCurrentUserRoles,
    login,
    logout,
    refreshAccessToken,
    register,
    updateCurrentUser,
} from '../controllers/auth'
import auth from '../middlewares/auth'
import {
    validateAuthentication,
    validateUserBody,
} from '../middlewares/validations'

const authRouter = Router()

authRouter.get('/user', auth, getCurrentUser)
authRouter.patch('/me', auth, updateCurrentUser)
authRouter.get('/user/roles', auth, getCurrentUserRoles)

authRouter.post('/login', validateAuthentication, login)
authRouter.get('/token', refreshAccessToken)
authRouter.post('/token', refreshAccessToken) // Рекомендации

authRouter.post('/logout', logout)

authRouter.post('/register', validateUserBody, register)

export default authRouter
