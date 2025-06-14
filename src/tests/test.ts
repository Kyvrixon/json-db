import Encryptor from "../lib/json-db.js";

const encryptor = new Encryptor("hello", {
    iterations: 25_000
});

async function $(): Promise<any> {
    const startTime = performance.now();
    console.log("generating object...");

    const content = "hello world";

    console.log("beginning encryption...");
    const encrypted = await encryptor.encrypt(content);
    const encryptTime = performance.now() - startTime;

    const decryptStartTime = performance.now();
    console.log("beginning decryption...");
    const decrypted = await encryptor.decrypt(encrypted);
    const decryptTime = performance.now() - decryptStartTime;

    console.log('\x1b[0m========================================');
    console.log(`\x1b[32mEncrypted:\x1b[0m ${encrypted}`);
    console.log(`\x1b[32mDecrypted:\x1b[0m ${decrypted}`);
    console.log(`\x1b[32mEncrypt time:\x1b[0m ${encryptTime.toFixed(2)} ms`);
    console.log(`\x1b[32mDecrypt time:\x1b[0m ${decryptTime.toFixed(2)} ms`);
    console.log('\x1b[0m========================================');
}

$();
