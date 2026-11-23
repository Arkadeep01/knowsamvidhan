const { prisma } = require("./node_modules/@prisma/client");

async function update() {
  const PREAMBLE_ID = "singleton";
  const preambleText =
    "WE, THE PEOPLE OF INDIA, having solemnly resolved to constitute India into a SOVEREIGN SOCIALIST SECULAR DEMOCRATIC REPUBLIC and to secure to all its citizens: JUSTICE, social, economic and political; LIBERTY of thought, expression, belief, faith and worship; EQUALITY of status and of opportunity; and to promote among them all FRATERNITY assuring the dignity of the individual and the unity and integrity of the Nation";

  try {
    const result = await prisma.preamble.upsert({
      where: { id: PREAMBLE_ID },
      update: {
        officialText: preambleText,
        simpleExplanation:
          "The Preamble is the introductory statement of the Constitution of India, reflecting the aspirations and values of the people.",
        whyItMatters:
          "The Preamble sets the tone for the Constitution, indicating the source of its authority and the goals it seeks to achieve for the nation.",
        keywords:
          '["constitution","preamble","sovereign","socialist","secular","democratic","republic","justice","liberty","equality","fraternity"]',
        timeline: '["1949-11-26 - Adopted by Constituent Assembly","1950-01-26 - Commenced"]',
        quickFacts: '["Adopted on November 26, 1949","Commenced on January 26, 1950"]',
        landmarkCases: "['Kesavananda Bharati v. State of Kerala (1973) - Basic structure doctrine']",
        notes: ""
      },
      create: {
        id: PREAMBLE_ID,
        officialText: preambleText,
        simpleExplanation:
          "The Preamble is the introductory statement of the Constitution of India, reflecting the aspirations and values of the people.",
        whyItMatters:
          "The Preamble sets the tone for the Constitution, indicating the source of its authority and the goals it seeks to achieve for the nation.",
        keywords:
          '["constitution","preamble","sovereign","socialist","secular","democratic","republic","justice","liberty","equality","fraternity"]',
        timeline: '["1949-11-26 - Adopted by Constituent Assembly","1950-01-26 - Commenced"]',
        quickFacts: '["Adopted on November 26, 1949","Commenced on January 26, 1950"]',
        landmarkCases: "['Kesavananda Bharati v. State of Kerala (1973) - Basic structure doctrine']",
        notes: ""
      }
    });
    console.log(
      "Preamble updated successfully:",
      result.officialText.substring(0, 50) + "..."
    );
  } catch (error) {
    console.error("Error updating preamble:", error);
  } finally {
    await prisma.$disconnect();
  }
}

update();