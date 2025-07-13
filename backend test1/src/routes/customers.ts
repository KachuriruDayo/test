import { Router } from 'express'
import {
    deleteCustomer,
    getCustomerById,
    getCustomers,
    updateCustomer,
} from '../controllers/customers'
import auth, { roleGuardMiddleware } from '../middlewares/auth'
import { validateObjId, validateUserBody } from '../middlewares/validations'
import { Role } from '../models/user'

const customerRouter = Router()

customerRouter.get('/', auth, roleGuardMiddleware(Role.Admin), getCustomers)

customerRouter.get('/:id', auth, roleGuardMiddleware(Role.Admin), validateObjId, getCustomerById)
customerRouter.patch('/:id', auth, roleGuardMiddleware(Role.Admin), validateObjId, validateUserBody, updateCustomer)
customerRouter.delete('/:id', auth, roleGuardMiddleware(Role.Admin), validateObjId, deleteCustomer)

export default customerRouter
