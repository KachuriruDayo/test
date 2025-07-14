import { NextFunction, Request, Response } from 'express'
import { FilterQuery, Types } from 'mongoose'
import NotFoundError from '../errors/not-found-error'
import Order from '../models/order'
import User, { IUser } from '../models/user'
import { normalizeCustomerQueryParams } from "../utils/parseQueryParams";

// --- Вспомогательные функции ---
function sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeObject);

    const cleanObj: any = {};
    Object.keys(obj).forEach((key) => {
        if (key.startsWith('$') || key.includes('.')) return; // убираем опасные ключи
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

// --- GET /customers ---
export const getCustomers = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const sanitizedObject = sanitizeObject(req.query);

        const {
            page,
            limit,
            sortField,
            sortOrder,
            registrationDateFrom,
            registrationDateTo,
            lastOrderDateFrom,
            lastOrderDateTo,
            totalAmountFrom,
            totalAmountTo,
            orderCountFrom,
            orderCountTo,
            search,
        } = normalizeCustomerQueryParams(sanitizedObject, 10);

        const allowedSortFields = ['createdAt', 'totalAmount', 'orderCount', 'name'];
        const safeSortField = allowedSortFields.includes(sortField) ? sortField : 'createdAt';

        const filters: FilterQuery<Partial<IUser>> = {};

        if (registrationDateFrom || registrationDateTo) {
            filters.createdAt = {};
            if (registrationDateFrom) filters.createdAt.$gte = registrationDateFrom;
            if (registrationDateTo) {
                const endOfDay = new Date(registrationDateTo);
                endOfDay.setHours(23, 59, 59, 999);
                filters.createdAt.$lte = endOfDay;
            }
        }

        if (lastOrderDateFrom || lastOrderDateTo) {
            filters.lastOrderDate = {};
            if (lastOrderDateFrom) filters.lastOrderDate.$gte = lastOrderDateFrom;
            if (lastOrderDateTo) {
                const endOfDay = new Date(lastOrderDateTo);
                endOfDay.setHours(23, 59, 59, 999);
                filters.lastOrderDate.$lte = endOfDay;
            }
        }

        if (totalAmountFrom !== undefined || totalAmountTo !== undefined) {
            filters.totalAmount = {};
            if (totalAmountFrom !== undefined) filters.totalAmount.$gte = totalAmountFrom;
            if (totalAmountTo !== undefined) filters.totalAmount.$lte = totalAmountTo;
        }

        if (orderCountFrom !== undefined || orderCountTo !== undefined) {
            filters.orderCount = {};
            if (orderCountFrom !== undefined) filters.orderCount.$gte = orderCountFrom;
            if (orderCountTo !== undefined) filters.orderCount.$lte = orderCountTo;
        }

        if (search && typeof search === 'string' && search.length <= 50) {
            const safeSearch = escapeRegex(search)
            const searchRegex = new RegExp(safeSearch, 'i')

            const orders = await Order.find(
                { $or: [{ deliveryAddress: searchRegex }] },
                '_id'
            );

            const orderIds = orders.map((order) => order._id);

            filters.$or = [
                { name: searchRegex },
                { lastOrder: { $in: orderIds } }
            ];
        }

        const sort: { [key: string]: 1 | -1 } = {};
        sort[safeSortField] = sortOrder === 'desc' ? -1 : 1;

        const options = {
            sort,
            skip: (page - 1) * limit,
            limit,
        };

        const users = await User.find(filters, null, options).populate([
            'orders',
            {
                path: 'lastOrder',
                populate: ['products', 'customer'],
            },
        ]);

        const totalUsers = await User.countDocuments(filters);
        const totalPages = Math.ceil(totalUsers / limit);

        const customers = users.map((u) => ({
            _id: u._id,
            name: u.name,
            email: u.email,
            roles: u.roles,
            totalAmount: u.totalAmount,
            orderCount: u.orderCount,
            lastOrderDate: u.lastOrderDate,
            orders: u.orders,
            lastOrder: u.lastOrder,
        }));

        res.status(200).json({
            customers,
            pagination: {
                totalUsers,
                totalPages,
                currentPage: page,
                pageSize: limit,
            },
        });
    } catch (error) {
        next(error);
    }
};

// --- GET /customers/:id ---
export const getCustomerById = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const id = typeof req.params.id === 'string' ? req.params.id : '';
        if (!isValidObjectId(id)) {
            return next(new NotFoundError('Неверный ID пользователя'));
        }

        const user = await User.findById(id).populate(['orders', 'lastOrder']);
        if (!user) {
            return next(new NotFoundError('Пользователь не найден'));
        }

        res.status(200).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            roles: user.roles,
            orders: user.orders,
            lastOrder: user.lastOrder,
        });
    } catch (error) {
        next(error);
    }
};

// --- PATCH /customers/:id ---
export const updateCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const id = typeof req.params.id === 'string' ? req.params.id : '';
        if (!isValidObjectId(id)) {
            return next(new NotFoundError('Неверный ID пользователя'));
        }

        const sanitizedBody = sanitizeObject(req.body);

        // Контролируем, что именно можно обновлять
        const updateData: Partial<IUser> = {};
        if (typeof sanitizedBody.name === 'string') updateData.name = sanitizedBody.name;
        if (typeof sanitizedBody.email === 'string') updateData.email = sanitizedBody.email;
        if (Array.isArray(sanitizedBody.roles)) updateData.roles = sanitizedBody.roles;

        const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });
        if (!updatedUser) {
            return next(new NotFoundError('Пользователь не найден'));
        }

        res.status(200).json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            roles: updatedUser.roles,
        });
    } catch (error) {
        next(error);
    }
};

// --- DELETE /customers/:id ---
export const deleteCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const id = typeof req.params.id === 'string' ? req.params.id : '';
        if (!isValidObjectId(id)) {
            return next(new NotFoundError('Неверный ID пользователя'));
        }

        const deletedUser = await User.findByIdAndDelete(id);
        if (!deletedUser) {
            return next(new NotFoundError('Пользователь не найден'));
        }

        res.status(204).end();
    } catch (error) {
        next(error);
    }
};
