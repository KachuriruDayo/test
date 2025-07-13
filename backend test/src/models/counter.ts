import mongoose, { Document, Schema } from 'mongoose'

interface ICounter extends Document {
    sequenceValue: number
}

const counterSchema = new Schema<ICounter>({
    sequenceValue: {
        type: Number,
        required: true,
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
    },
})

export default mongoose.model<ICounter>('counter', counterSchema)
