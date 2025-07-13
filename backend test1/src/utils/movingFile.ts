import { promises as fs } from 'fs';
import { basename, join } from 'path';

async function movingFile(imagePath: string, from: string, to: string): Promise<void> {
    const fileName = basename(imagePath);
    console.log(`Found ${fileName}`);
    const imagePathTemp = join(from, fileName);
    console.log(`Found ${imagePathTemp}`);
    const imagePathPermanent = join(to, fileName);
    console.log(`Found ${imagePathPermanent}`);

    try {
        await fs.access(imagePathTemp);
    } catch {
        throw new Error('Ошибка при сохранении файла: файл не найден');
    }

    try {
        await fs.rename(imagePathTemp, imagePathPermanent);
    } catch {
        throw new Error('Ошибка при сохранении файла: не удалось переместить файл');
    }
}

export default movingFile;
