/* eslint-disable no-param-reassign */
import mongoose, {
    Document,
    HydratedDocument,
    Model,
    Types,
    Schema,
  } from 'mongoose'
  import validator from 'validator'
  import bcrypt from 'bcrypt'
  import jwt from 'jsonwebtoken'
  import crypto from 'crypto'
  
  import { ACCESS_TOKEN, REFRESH_TOKEN } from '../config'
  import UnauthorizedError from '../errors/unauthorized-error'
  
  export enum Role {
    Customer = 'customer',
    Admin = 'admin',
  }
  
  export interface IUser extends Document {
    _id: Types.ObjectId
    name: string
    email: string
    password: string
    tokens: { token: string }[]
    roles: Role[]
    phone: string
    totalAmount: number
    orderCount: number
    orders: Types.ObjectId[]
    lastOrderDate: Date | null
    lastOrder: Types.ObjectId | null
  }
  
  interface IUserMethods {
    generateAccessToken(this: HydratedDocument<IUser, IUserMethods>): string
    generateRefreshToken(this: HydratedDocument<IUser, IUserMethods>): Promise<string>
    calculateOrderStats(this: HydratedDocument<IUser, IUserMethods>): Promise<void>
  }
  
  interface IUserModel extends Model<IUser, {}, IUserMethods> {
    findUserByCredentials: (
      email: string,
      password: string
    ) => Promise<HydratedDocument<IUser, IUserMethods>>
  }
  
  const userSchema = new Schema<IUser, IUserModel, IUserMethods>(
    {
      name: {
        type: String,
        default: 'Евлампий',
        minlength: [2, 'Минимальная длина поля "name" - 2'],
        maxlength: [30, 'Максимальная длина поля "name" - 30'],
      },
      email: {
        type: String,
        required: [true, 'Поле "email" должно быть заполнено'],
        unique: true,
        validate: {
          validator: (v: string) => validator.isEmail(v),
          message: 'Поле "email" должно быть валидным email-адресом',
        },
      },
      password: {
        type: String,
        required: [true, 'Поле "password" должно быть заполнено'],
        minlength: [6, 'Минимальная длина поля "password" - 6'],
        select: false,
      },
      tokens: [
        {
          token: { required: true, type: String },
        },
      ],
      roles: {
        type: [String],
        enum: Object.values(Role),
        default: [Role.Customer],
      },
      phone: {
        type: String,
        maxlength: [30, 'Максимальная длина поля "phone" - 30'],
      },
      lastOrderDate: {
        type: Date,
        default: null,
      },
      lastOrder: {
        type: Schema.Types.ObjectId,
        ref: 'order',
        default: null,
      },
      totalAmount: { type: Number, default: 0 },
      orderCount: { type: Number, default: 0 },
      orders: [
        {
          type: Types.ObjectId,
          ref: 'order',
        },
      ],
    },
    {
      versionKey: false,
      timestamps: true,
      toJSON: {
        virtuals: true,
        transform: (_doc, ret) => {
          delete ret.tokens
          delete ret.password
          delete ret._id
          delete ret.roles
          return ret
        },
      },
    }
  )
  
  userSchema.pre('save', async function (next) {
    try {
      if (this.isModified('password')) {
        const saltRounds = 10
        this.password = await bcrypt.hash(this.password, saltRounds)
      }
      next()
    } catch (error) {
      next(error as Error)
    }
  })
  
  userSchema.methods.generateAccessToken = function (this: HydratedDocument<IUser, IUserMethods>) {
    return jwt.sign(
      {
        _id: this._id.toString(),
        email: this.email,
      },
      ACCESS_TOKEN.secret,
      {
        expiresIn: ACCESS_TOKEN.expiry,
        subject: this.id,
      }
    )
  }
  
  userSchema.methods.generateRefreshToken = async function (
    this: HydratedDocument<IUser, IUserMethods>
  ) {
    const refreshToken = jwt.sign(
      {
        _id: this._id.toString(),
        email: this.email,
      },
      REFRESH_TOKEN.secret,
      {
        expiresIn: REFRESH_TOKEN.expiry,
        subject: this.id,
      }
    )
  
    const rTknHash = crypto
      .createHmac('sha256', REFRESH_TOKEN.secret)
      .update(refreshToken)
      .digest('hex')
  
    this.tokens.push({ token: rTknHash })
    await this.save()
  
    return refreshToken
  }
  
  userSchema.methods.calculateOrderStats = async function (
    this: HydratedDocument<IUser, IUserMethods>
  ) {
    const orderStats = await mongoose.model('order').aggregate([
      { $match: { customer: this._id } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$totalAmount' },
          lastOrderDate: { $max: '$createdAt' },
          orderCount: { $sum: 1 },
          lastOrder: { $last: '$_id' },
        },
      },
    ])
  
    if (orderStats.length > 0) {
      const stats = orderStats[0]
      this.totalAmount = stats.totalAmount
      this.orderCount = stats.orderCount
      this.lastOrderDate = stats.lastOrderDate
      this.lastOrder = stats.lastOrder
    } else {
      this.totalAmount = 0
      this.orderCount = 0
      this.lastOrderDate = null
      this.lastOrder = null
    }
  
    await this.save()
  }
  
  userSchema.statics.findUserByCredentials = async function (
    email: string,
    password: string
  ) {
    const user = await this.findOne({ email })
      .select('+password')
      .orFail(() => new UnauthorizedError('Неправильные почта или пароль'))
  
    const passwdMatch = await bcrypt.compare(password, user.password)
    if (!passwdMatch) {
      throw new UnauthorizedError('Неправильные почта или пароль')
    }
  
    return user
  }
  
  const UserModel = mongoose.model<IUser, IUserModel>('user', userSchema)
  export default UserModel
  