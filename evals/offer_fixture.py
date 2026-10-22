"""A second fixture for the question answering evaluation: a made up job offer, so the scores do not rest on one
document type. It has 17 short clauses, 25 questions that the offer answers and 18 that it does not, ten of those
being near misses where the topic is in a clause but the specific fact asked for is not.

Written on October 22, before any result had been seen for it, and not tuned afterward. Questions were kept
clear of the trap found on the first fixture, asking for one kind of figure (dollars) where the clause gives
another (a percentage or a number of months).
"""

CLAUSES: dict[str, str] = {
    "base_salary": "The annual base salary is one hundred twenty thousand dollars, paid in equal installments every two weeks.",
    "signing_bonus": "A signing bonus of fifteen thousand dollars is paid with the first paycheck and must be repaid in full if the employee leaves within twelve months.",
    "annual_bonus": "The employee is eligible for an annual performance bonus of up to ten percent of base salary, at the company's discretion.",
    "equity_grant": "The employee is granted four thousand stock options, which vest over four years with a one year cliff.",
    "start_date": "Employment begins on the first Monday of next month, subject to completion of a background check.",
    "at_will": "Employment is at will, which means either side may end it at any time, with or without cause or notice.",
    "notice_period": "The employee agrees to give two weeks written notice before resigning, and the company may waive that notice.",
    "severance": "If the company ends employment without cause, it will pay four weeks of base salary for each full year of service.",
    "pto": "The employee receives twenty days of paid vacation each year, which accrue monthly and do not carry over past one year.",
    "benefits": "Health, dental and vision insurance start on the first day of the month after the start date, and the company pays eighty percent of the premium.",
    "retirement": "The company matches retirement contributions dollar for dollar up to four percent of base salary.",
    "noncompete": "For twelve months after employment ends, the employee may not work for a direct competitor within the same state.",
    "confidentiality": "The employee must keep the company's confidential information private during and after employment.",
    "ip_assignment": "All inventions and work created by the employee in the course of the job belong to the company.",
    "relocation": "The company will reimburse moving expenses up to five thousand dollars if receipts are submitted within sixty days.",
    "remote_work": "The employee may work from home up to three days a week with manager approval.",
    "probation": "The first ninety days are a probationary period during which performance is reviewed monthly.",
}

# (question, key of the one clause that answers it, difficulty), the same shape as retrieval_fixture.QUESTIONS
ANSWERABLE: list[tuple[str, str, str]] = [
    ("What is the base salary?", "base_salary", "lexical"),
    ("How much is the signing bonus?", "signing_bonus", "lexical"),
    ("How many stock options are granted?", "equity_grant", "lexical"),
    ("How much notice do I have to give before resigning?", "notice_period", "lexical"),
    ("How many days of paid vacation do I get?", "pto", "lexical"),
    ("Is there a non-compete?", "noncompete", "lexical"),
    ("How often am I paid?", "base_salary", "paraphrase"),
    ("When do I have to start?", "start_date", "paraphrase"),
    ("Do I have to pay back the bonus if I quit early?", "signing_bonus", "paraphrase"),
    ("How long until my options fully vest?", "equity_grant", "paraphrase"),
    ("Does the company match my 401k?", "retirement", "paraphrase"),
    ("When does my health insurance begin?", "benefits", "paraphrase"),
    ("Can I work from home?", "remote_work", "paraphrase"),
    ("Who owns what I build at work?", "ip_assignment", "paraphrase"),
    ("Will the company cover the cost of my move?", "relocation", "paraphrase"),
    ("Is there a trial period at the start?", "probation", "paraphrase"),
    ("Do I have to keep company information secret after I leave?", "confidentiality", "paraphrase"),
    ("If I am laid off, do I get any payout?", "severance", "hard"),
    ("Can they fire me without a reason?", "at_will", "hard"),
    ("What if I leave after six months, do I keep the signing bonus?", "signing_bonus", "hard"),
    ("If I leave after two years, can I take a job at a rival next door?", "noncompete", "hard"),
    ("Can unused vacation roll over to next year?", "pto", "hard"),
    ("Will the company pay part of my insurance cost?", "benefits", "hard"),
    ("Is the annual bonus guaranteed?", "annual_bonus", "hard"),
    ("By when do I have to send in moving receipts?", "relocation", "hard"),
]

UNANSWERABLE: list[str] = [
    "What is the company's name?",
    "Who will my manager be?",
    "What are the working hours?",
    "Is there a dress code?",
    "What city is the office in?",
    "How many employees does the company have?",
    "Is there a gym stipend?",
    "What laptop will I be given?",
    # near misses: the topic is in a clause, the fact asked for is not
    "What is the exercise price of the stock options?",
    "On what date is the annual bonus paid?",
    "How many sick days do I get?",
    "Is the signing bonus taxed before it is paid?",
    "What happens to unvested options if I am laid off?",
    "Which companies count as direct competitors?",
    "Who is the insurance provider?",
    "How much is the raise each year?",
    "Does the retirement match vest over time?",
    "Which days of the week can I work from home?",
]
