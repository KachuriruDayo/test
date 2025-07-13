import { NextFunction, Request, Response } from 'express'
import { FilterQuery, Types } from 'mongoose'
import NotFoundError from '../errors/not-found-error'
import Order from '../models/order'
import User, { IUser } from '../models/user'

function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const cleanObj: any = {};
  Object.keys(obj).forEach((key) => {
    if (key.startsWith('$') || key.includes('.')) return;
    cleanObj[key] = sanitizeObject(obj[key]);
  });
  return cleanObj;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id) && (new Types.ObjectId(id)).toString() === id
}

// GET /customers
export const getCustomers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const query = sanitizeObject(req.query)

    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(Number(query.limit), 10)

    const allowedSortFields = ['createdAt', 'totalAmount', 'orderCount', 'name']
    const sortField = allowedSortFields.includes(query.sortField as string)
      ? (query.sortField as string)
      : 'createdAt'

    const sortOrder = query.sortOrder === 'asc' ? 1 : -1

    const filters: FilterQuery<Partial<IUser>> = {}

    if (query.registrationDateFrom) {
      filters.createdAt = {
        ...filters.createdAt,
        $gte: new Date(query.registrationDateFrom as string),
      }
    }
    if (query.registrationDateTo) {
      const endOfDay = new Date(query.registrationDateTo as string)
      endOfDay.setHours(23, 59, 59, 999)
      filters.createdAt = {
        ...filters.createdAt,
        $lte: endOfDay,
      }
    }
    if (query.lastOrderDateFrom) {
      filters.lastOrderDate = {
        ...filters.lastOrderDate,
        $gte: new Date(query.lastOrderDateFrom as string),
      }
    }
    if (query.lastOrderDateTo) {
      const endOfDay = new Date(query.lastOrderDateTo as string)
      endOfDay.setHours(23, 59, 59, 999)
      filters.lastOrderDate = {
        ...filters.lastOrderDate,
        $lte: endOfDay,
      }
    }
    if (query.totalAmountFrom) {
      filters.totalAmount = {
        ...filters.totalAmount,
        $gte: Number(query.totalAmountFrom),
      }
    }
    if (query.totalAmountTo) {
      filters.totalAmount = {
        ...filters.totalAmount,
        $lte: Number(query.totalAmountTo),
      }
    }
    if (query.orderCountFrom) {
      filters.orderCount = {
        ...filters.orderCount,
        $gte: Number(query.orderCountFrom),
      }
    }
    if (query.orderCountTo) {
      filters.orderCount = {
        ...filters.orderCount,
        $lte: Number(query.orderCountTo),
      }
    }

    if (
      query.search &&
      typeof query.search === 'string' &&
      query.search.length <= 50
    ) {
      const safeSearch = escapeRegex(query.search)
      const searchRegex = new RegExp(safeSearch, 'i')

      const orders = await Order.find(
        {
          $or: [{ deliveryAddress: searchRegex }],
        },
        '_id'
      )

      const orderIds = orders.map((order) => order._id)

      filters.$or = [{ name: searchRegex }, { lastOrder: { $in: orderIds } }]
    }

    const sort: { [key: string]: number } = {}
    sort[sortField] = sortOrder

    const options = {
      sort,
      skip: (page - 1) * limit,
      limit,
    }

    const users = await User.find(filters, null, options).populate([
      'orders',
      {
        path: 'lastOrder',
        populate: ['products', 'customer'],
      },
    ])

    const totalUsers = await User.countDocuments(filters)
    const totalPages = Math.ceil(totalUsers / limit)

    res.status(200).json({
      customers: users.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        roles: u.roles,
        totalAmount: u.totalAmount,
        orderCount: u.orderCount,
        lastOrderDate: u.lastOrderDate,
        orders: u.orders,
        lastOrder: u.lastOrder,
      })),
      pagination: {
        totalUsers,
        totalPages,
        currentPage: page,
        pageSize: limit,
      },
    })
  } catch (error) {
    next(error)
  }
}

// GET /customers/:id
export const getCustomerById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : ''
    if (!isValidObjectId(id)) {
      return next(new NotFoundError('Неверный ID пользователя'))
    }

    const user = await User.findById(id).populate(['orders', 'lastOrder'])
    if (!user) {
      return next(new NotFoundError('Пользователь не найден'))
    }

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      orders: user.orders,
      lastOrder: user.lastOrder,
    })
  } catch (error) {
    next(error)
  }
}

// PATCH /customers/:id
export const updateCustomer = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : ''
    if (!isValidObjectId(id)) {
      return next(new NotFoundError('Неверный ID пользователя'))
    }

    const body = sanitizeObject(req.body)

    const updateData: Partial<IUser> = {}
    if (typeof body.name === 'string') updateData.name = body.name
    if (typeof body.email === 'string') updateData.email = body.email
    if (Array.isArray(body.roles)) updateData.roles = body.roles

    const updatedUser = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .orFail(() => new NotFoundError('Пользователь не найден'))
      .populate(['orders', 'lastOrder'])

    res.status(200).json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      roles: updatedUser.roles,
      orders: updatedUser.orders,
      lastOrder: updatedUser.lastOrder,
    })
  } catch (error) {
    next(error)
  }
}

// DELETE /customers/:id
export const deleteCustomer = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : ''
    if (!isValidObjectId(id)) {
      return next(new NotFoundError('Неверный ID пользователя'))
    }

    const deletedUser = await User.findByIdAndDelete(id).orFail(
      () => new NotFoundError('Пользователь не найден')
    )

    res.status(200).json({
      _id: deletedUser._id,
      email: deletedUser.email,
      name: deletedUser.name,
      roles: deletedUser.roles,
    })
  } catch (error) {
    next(error)
  }
}
