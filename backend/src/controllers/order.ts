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
        const { search, page = '1', limit = '5' } = req.query

        const normalizedLimit = normalizeLimit(limit, 5)
        const currentPage = Math.max(1, parseInt(page as string, 10) || 1)
        const skip = (currentPage - 1) * normalizedLimit

        const user = await User.findById(userId)
            .populate({
                path: 'orders',
                populate: ['products', 'customer'],
            })
            .orFail(() => new NotFoundError('Пользователь по заданному id отсутствует в базе'))

        let orders = user.orders as unknown as IOrder[]

        if (typeof search === 'string' && search.length > 0) {
            if (search.length > 100) {
                throw new BadRequestError('Поисковый запрос слишком длинный')
            }

            const safeSearch = escapeRegExp(search)
            const searchRegex = new RegExp(safeSearch, 'i')

            // Попытка парсинга числа для поиска по orderNumber и цене
            const searchNumber = Number(search)
            const hasValidNumber = !Number.isNaN(searchNumber)

            // Формируем фильтр по товарам
            const productQuery: any = { title: searchRegex }
            if (hasValidNumber) {
                productQuery.$or = [{ title: searchRegex }, { price: searchNumber }]
            }

            // Ограничиваем максимум 50 для предотвращения тяжелых запросов
            const products = await Product.find(productQuery).limit(50)
            const productIdsSet = new Set(products.map(p => p._id.toString()))

            orders = orders.filter(order => {
                const matchesProductTitle = order.products.some(product =>
                    productIdsSet.has(product._id.toString())
                )
                const matchesOrderNumber = hasValidNumber && order.orderNumber === searchNumber
                return matchesOrderNumber || matchesProductTitle
            })
        }

        const totalOrders = orders.length
        const totalPages = Math.ceil(totalOrders / normalizedLimit)

        // Пагинация по отфильтрованному списку
        const paginatedOrders = orders.slice(skip, skip + normalizedLimit)

        return res.status(200).json({
            orders: paginatedOrders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage,
                pageSize: normalizedLimit,
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

        if (!Array.isArray(items)) {
            return next(new BadRequestError('Поле items должно быть массивом'))
        }

        // Получаем все продукты из БД (можно оптимизировать запрос, но пока так)
        const products = await Product.find<IProduct>({})

        // Собираем корзину
        const basket: IProduct[] = []

        items.forEach((id: Types.ObjectId) => {
            const product = products.find((p) => p._id.equals(id))
            if (!product) {
                throw new BadRequestError(`Товар с id ${id} не найден`)
            }
            if (product.price === null) {
                throw new BadRequestError(`Товар с id ${id} не продается`)
            }
            basket.push(product)
        })

        // Проверяем сумму
        const totalBasket = basket.reduce((sum, product) => sum + product.price, 0)
        if (totalBasket !== total) {
            return next(new BadRequestError('Неверная сумма заказа'))
        }

        // Нормализация телефона с проверкой
        const normalizedPhone = normalizePhone(phone, 'RU')
        if (!normalizedPhone) {
            return next(new BadRequestError('Некорректный номер телефона'))
        }

        // Функция для безопасной санитизации и ограничения длины
        const sanitizeAndTrim = (input: string, maxLength: number) =>
            sanitizeHtml(input).slice(0, maxLength)

        // Создаем заказ
        const newOrder = new Order({
            totalAmount: total,
            products: items,
            payment: sanitizeAndTrim(payment, 50),
            phone: normalizedPhone,
            email: sanitizeAndTrim(email, 100),
            comment: sanitizeAndTrim(comment, 1000),
            customer: userId,
            deliveryAddress: sanitizeAndTrim(address, 200),
        })

        // Заполняем связи и сохраняем
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
