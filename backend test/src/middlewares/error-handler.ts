import { ErrorRequestHandler } from 'express'

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const statusCode = err.statusCode || 500
    const message =
        statusCode === 500 ? 'На сервере произошла ошибка' : err.message
    console.log(err)

    if (process.env.NODE_ENV !== 'production') {
        console.error('Ошибка:', err)
    }

    res.status(statusCode).send({ message })
}

export default errorHandler
