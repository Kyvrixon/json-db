import fs from "fs";
import path from "path";
import { type ZodSchema } from "zod";

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export default class Database {
    private processingList: Set<string>;
    private basePath: string;

    constructor(basePath: string) {
        if (!fs.existsSync(basePath)) throw new Error("[@kyvrixon/json-db] Base path does not exist.");
        this.basePath = basePath;
        this.processingList = new Set<string>();
    };

    /**
     * Read contents of a file with optional validation
     * 
     * @param file The file to read e.g `"users"` or `"users/123"`.
     * @param schema zod validation schema
     */
    async read<T = unknown>(file: string, schema?: ZodSchema<T>): Promise<T> {
        while (this.processingList.has(file)) {
            await delay(50);
        }
        this.processingList.add(file);
        const data = await fs.promises.readFile(path.resolve(this.basePath, file + ".json"), "utf8");
        const parsed = JSON.parse(data);

        if (!schema) {
            this.processingList.delete(file);
            return parsed;
        }

        try {
            const $ = await schema.parseAsync(parsed);
            this.processingList.delete(file);
            return $;
        } catch (e) {
            this.processingList.delete(file);
            throw new Error("[@kyvrixon/json-db] Schema validaton failed for file: " + file);
        }
    }
};