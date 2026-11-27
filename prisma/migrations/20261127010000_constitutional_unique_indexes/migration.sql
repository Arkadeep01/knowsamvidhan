-- CreateIndex
CREATE UNIQUE INDEX "Part_partNumber_key" ON "Part"("partNumber");
CREATE UNIQUE INDEX "Article_articleNumber_key" ON "Article"("articleNumber");
CREATE UNIQUE INDEX "Clause_articleId_clauseNumber_key" ON "Clause"("articleId", "clauseNumber");
