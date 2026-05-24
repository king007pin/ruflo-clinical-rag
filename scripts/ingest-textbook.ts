import { readFileSync, existsSync } from "fs";
import { getDocumentProxy } from "unpdf";
import { dbCorpus } from "../src/db";
import { embeddings, sources } from "../src/db/schema";
import { chunkText, embedBatch } from "../src/lib/rag";
import { createHash } from "crypto";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

async function ingestTextbook() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log(`
Usage:
  npx tsx scripts/ingest-textbook.ts <pdf-file-path> "<textbook-title>" "<mbbs-subject>" ["<description>"]

Example:
  npx tsx scripts/ingest-textbook.ts /path/to/robbins.pdf "Robbins & Cotran Pathologic Basis of Disease" "Pathology" "Definitive gold standard pathology textbook"
    `);
    process.exit(1);
  }

  const [pdfPath, title, subject, customDesc] = args;
  const description = `subject: ${subject} | ${customDesc || "Gold-standard reference textbook"}`;

  if (!existsSync(pdfPath)) {
    console.error(`Error: File not found at path "${pdfPath}"`);
    process.exit(1);
  }

  console.log(`\n📚 Starting ingestion for textbook:`);
  console.log(`   - Title:    ${title}`);
  console.log(`   - Subject:  ${subject}`);
  console.log(`   - Path:     ${pdfPath}\n`);

  console.log(`[1/4] Reading PDF file into buffer...`);
  const buffer = readFileSync(pdfPath);
  const u8 = new Uint8Array(buffer);

  console.log(`[2/4] Loading PDF document with PDF.js...`);
  let pdf;
  try {
    pdf = await getDocumentProxy(u8);
  } catch (err) {
    console.error("Failed to load PDF. Is it encrypted or corrupted?", err);
    process.exit(1);
  }

  const numPages = pdf.numPages;
  console.log(`      PDF successfully loaded! Total pages: ${numPages}`);

  // We process in batches of 10 pages to avoid memory spikes and parse text incrementally
  console.log(`[3/4] Extracting text and generating embeddings page-by-page...`);
  const contentHash = sha256(buffer.toString("base64").slice(0, 1000000)); // hash of structural content sample

  // 1. Create a Source record for the entire textbook
  const [createdSource] = await dbCorpus
    .insert(sources)
    .values({
      title,
      type: "pdf",
      description,
      contentHash,
    })
    .returning();

  console.log(`      Created Source record in database (Source ID: ${createdSource.id})`);

  let totalChunksIngested = 0;
  const PAGE_BATCH_SIZE = 10;
  let pageAccumulatorText = "";

  for (let i = 1; i <= numPages; i++) {
    process.stdout.write(`\r      Processing page ${i}/${numPages}... `);
    try {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      pageAccumulatorText += ` [Page ${i}] ${pageText}`;
    } catch (pageErr) {
      console.warn(`\n      ⚠️ Warning: Failed to extract text from page ${i}:`, pageErr);
    }

    // Process and flush text when we hit PAGE_BATCH_SIZE or the end of the document
    if (i % PAGE_BATCH_SIZE === 0 || i === numPages) {
      const cleanText = pageAccumulatorText.replace(/\s+/g, " ").trim();
      pageAccumulatorText = ""; // clear accumulator

      if (!cleanText) continue;

      // Slice the accumulated batch of pages into RAG chunks
      const chunks = chunkText(cleanText);
      if (!chunks.length) continue;

      // Embed chunks in batches of 32
      const EMBED_BATCH_SIZE = 32;
      const vectors: number[][] = [];
      for (let c = 0; c < chunks.length; c += EMBED_BATCH_SIZE) {
        const batchChunks = chunks.slice(c, c + EMBED_BATCH_SIZE);
        const batchVectors = await embedBatch(batchChunks, "passage");
        vectors.push(...batchVectors);
      }

      // Bulk insert this batch of chunks and vectors
      await dbCorpus.insert(embeddings).values(
        chunks.map((chunk, idx) => ({
          sourceId: createdSource.id,
          chunk,
          position: totalChunksIngested + idx,
          embedding: vectors[idx],
        })),
      );

      totalChunksIngested += chunks.length;
    }
  }

  // Clean up PDF proxy memory
  await pdf.destroy().catch(() => {});

  console.log(`\n\n🎉 Ingestion successful!`);
  console.log(`   - Ingested:    ${numPages} pages`);
  console.log(`   - Created:     ${totalChunksIngested} RAG chunks`);
  console.log(`   - Database:    Sources and Embeddings tables updated.`);
}

ingestTextbook()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Critical Ingestion Error:", err);
    process.exit(1);
  });
