import { NextFunction, Request, Response } from 'express'
import { FilterQuery, Error as MongooseError, Types } from 'mongoose'
import BadRequestError from '../errors/bad-request-error'
import NotFoundError from '../errors/not-found-error'
import Order, { IOrder } from '../models/order'
import Product, { IProduct } from '../models/product'
import User from '../models/user'
import { sanitizeHtml } from "../middlewares/sanitize";
import escapeRegExp from "../utils/escapeRegExp";
import { normalizeLimit, normalizePhone, normalizeOrderQueryParams } from "../utils/parseQueryParams";

// GET /orders (admin)
export const getOrders = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const {
            page = 1,
            limit = 10,
            sortField = 'createdAt',
            sortOrder = 'desc',
            status,
            totalAmountFrom,
            totalAmountTo,
            orderDateFrom,
            orderDateTo,
            search,
        } = normalizeOrderQueryParams(req.query, 10)

        const filters: FilterQuery<Partial<IOrder>> = {}

        if (status) {
            if (typeof status === 'string' && /^[a-zA-Z0-9_-]+$/.test(status)) {
                filters.status = status
            } else {
                throw new BadRequestError('Передан невалидный параметр статуса')
            }
        }

        if (search) {
            if (/[^\w\s]/.test(search as string)) {
                throw new BadRequestError('Передан невалидный поисковый запрос')
            }
        }

        if (status) {
            if (typeof status === 'object') {
                Object.assign(filters, status)
            }
            if (typeof status === 'string') {
                filters.status = status
            }
        }

        if (totalAmountFrom !== undefined || totalAmountTo !== undefined) {
            filters.totalAmount = {};
            if (totalAmountFrom !== undefined) filters.totalAmount.$gte = totalAmountFrom;
            if (totalAmountTo !== undefined) filters.totalAmount.$lte = totalAmountTo;
        }

        if (orderDateFrom !== undefined || orderDateTo !== undefined) {
            filters.createdAt = {};
            if (orderDateFrom !== undefined) filters.createdAt.$gte = orderDateFrom;
            if (orderDateTo !== undefined) filters.createdAt.$lte = orderDateTo;
        }

        const aggregatePipeline: any[] = [
            { $match: filters },
            {
                $lookup: {
                    from: 'products',
                    localField: 'products',
                    foreignField: '_id',
                    as: 'products',
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customer',
                },
            },
            { $unwind: '$customer' },
            { $unwind: '$products' },
        ]

        if (search) {
            const safeSearch = escapeRegExp(search as string)
            const searchRegex = new RegExp(safeSearch, 'i')
            const searchNumber = Number(search)

            const searchConditions: any[] = [{ 'products.title': searchRegex }]

            if (!Number.isNaN(searchNumber)) {
                searchConditions.push({ orderNumber: searchNumber })
            }

            aggregatePipeline.push({
                $match: {
                    $or: searchConditions,
                },
            })

            filters.$or = searchConditions
        }

        const sort: { [key: string]: any } = {}

        if (sortField && sortOrder) {
            sort[sortField as string] = sortOrder === 'desc' ? -1 : 1
        }

        aggregatePipeline.push(
            { $sort: sort },
            { $skip: (page - 1) * limit },
            { $limit: limit},
            {
                $group: {
                    _id: '$_id',
                    orderNumber: { $first: '$orderNumber' },
                    status: { $first: '$status' },
                    totalAmount: { $first: '$totalAmount' },
                    products: { $push: '$products' },
                    customer: { $first: '$customer' },
                    createdAt: { $first: '$createdAt' },
                },
            }
        )

        const orders = await Order.aggregate(aggregatePipeline)
        const totalOrders = await Order.countDocuments(filters)
        const totalPages = Math.ceil(totalOrders / limit)

        res.status(200).json({
            orders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: page,
                pageSize: limit,
            },
        })
    } catch (error) {
        next(error)
    }
} 
      
  export const getOrdersCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = res.locals.user._id
      const { search, page = 1, limit = 5 } = req.query
      const safeLimit = Math.min(Number(limit), 10)
      const skip = (Number(page) - 1) * safeLimit
  
      const user = await User.findById(userId)
        .populate({
          path: 'orders',
          populate: [{ path: 'products' }, { path: 'customer' }],
        })
        .orFail(() => new NotFoundError('Пользователь не найден'))
  
      let orders = user.orders as unknown as IOrder[]
  
      const isSafe = typeof search === 'string' && search.length < 100 && /^[\wа-яА-ЯёЁ0-9\s\-.,]+$/.test(search)
  
      if (search && isSafe) {
        const searchRegex = new RegExp(search, 'i')
        const searchNumber = Number(search)
        const products = await Product.find({ title: searchRegex })
        const productIds: Types.ObjectId[] = products.map((p) => p._id as Types.ObjectId)
  
        orders = orders.filter((order) => {
          const matchesTitle = order.products.some((p) =>
            productIds.some((id) => (p._id as Types.ObjectId).equals(id))
          )
          const matchesNumber =
            !Number.isNaN(searchNumber) && order.orderNumber === searchNumber
          return matchesTitle || matchesNumber
        })
      }
  
      const totalOrders = orders.length
      const totalPages = Math.ceil(totalOrders / safeLimit)
      orders = orders.slice(skip, skip + safeLimit)
  
      return res.status(200).json({
        orders,
        pagination: {
          totalOrders,
          totalPages,
          currentPage: Number(page),
          pageSize: safeLimit,
        },
      })
    } catch (error) {
      next(error)
    }
  }
  
  
export const getOrderByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const orderNumber = typeof req.params.orderNumber === 'string' ? req.params.orderNumber : ''
        const order = await Order.findOne({
            orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(() => new NotFoundError('Заказ не найден'))

        return res.status(200).json(order)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Неверный ID заказа'))
        }
        return next(error)
    }
}

export const getOrderCurrentUserByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    try {
        const orderNumber = typeof req.params.orderNumber === 'string' ? req.params.orderNumber : ''
        const order = await Order.findOne({
            orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(() => new NotFoundError('Заказ не найден'))

        if (!order.customer._id.equals(userId)) {
            return next(new NotFoundError('Заказ не найден'))
        }

        return res.status(200).json(order)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Неверный ID заказа'))
        }
        return next(error)
    }
}

export const createOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const basket: IProduct[] = []
      const products = await Product.find<IProduct>({})
      const userId = res.locals.user._id
      const {
        address = '',
        payment = '',
        phone = '',
        total,
        email = '',
        items,
        comment = '',
      } = req.body
  
      const normalizedPhone = phone.replace(/\D/g, '')
  
      if (!Array.isArray(items)) {
        return next(new BadRequestError('Поле items должно быть массивом'))
      }
  
      items.forEach((id: Types.ObjectId) => {
        const product = products.find((p) =>
          (p._id as Types.ObjectId).equals(id)
        )
        if (!product) {
          throw new BadRequestError(`Товар с id ${id} не найден`)
        }
        if (product.price === null) {
          throw new BadRequestError(`Товар с id ${id} не продается`)
        }
        basket.push(product)
      })
  
      const totalBasket = basket.reduce((a, c) => a + c.price, 0)
      if (totalBasket !== total) {
        return next(new BadRequestError('Неверная сумма заказа'))
      }
  
      const newOrder = new Order({
        totalAmount: total,
        products: items,
        payment: escape(payment).slice(0, 50),
        phone: normalizedPhone,
        email: escape(email).slice(0, 100),
        comment: escape(comment).slice(0, 1000),
        customer: userId,
        deliveryAddress: escape(address).slice(0, 200),
      })
  
      const populatedOrder = await newOrder.populate(['customer', 'products'])
      await populatedOrder.save()
  
      return res.status(200).json(populatedOrder)
    } catch (error) {
      if (error instanceof MongooseError.ValidationError) {
        return next(new BadRequestError(error.message))
      }
      return next(error)
    }
}
  
export const updateOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const status = typeof req.body.status === 'string' ? req.body.status : undefined
        const orderNumber = typeof req.params.orderNumber === 'string' ? req.params.orderNumber : ''

        const updatedOrder = await Order.findOneAndUpdate(
            { orderNumber },
            { status },
            { new: true, runValidators: true }
        )
            .orFail(() => new NotFoundError('Заказ не найден'))
            .populate(['customer', 'products'])

        return res.status(200).json(updatedOrder)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Неверный ID заказа'))
        }
        return next(error)
    }
}

export const deleteOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const id = typeof req.params.id === 'string' ? req.params.id : ''
        const deletedOrder = await Order.findByIdAndDelete(id)
            .orFail(() => new NotFoundError('Заказ не найден'))
            .populate(['customer', 'products'])

        return res.status(200).json(deletedOrder)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Неверный ID заказа'))
        }
        return next(error)
    }
}
