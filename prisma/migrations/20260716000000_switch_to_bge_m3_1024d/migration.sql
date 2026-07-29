-- Switch embedding column from vector(1536) to vector(1024) for bge-m3 model
ALTER TABLE dt_document_chunks ALTER COLUMN embedding TYPE vector(1024);

