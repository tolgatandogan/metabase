import {
  enterCustomColumnDetails,
  getNotebookStep,
  interceptPromise,
  modal,
  openOrdersTable,
  openProductsTable,
  openNotebookEditor,
  popover,
  restore,
  visitQuestionAdhoc,
  visualize,
} from "__support__/e2e/cypress";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

describe("scenarios > question > notebook", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shouldn't offer to save the question when there were no changes (metabase#13470)", () => {
    openOrdersTable();
    // save question initially
    cy.findByText("Save").click();
    cy.get(".ModalBody")
      .contains("Save")
      .click();
    cy.findByText("Not now").click();
    // enter "notebook" and visualize without changing anything
    cy.icon("notebook").click();

    cy.button("Visualize").click();

    // there were no changes to the question, so we shouldn't have the option to "Save"
    cy.findByText("Save").should("not.exist");
  });

  it("should allow post-aggregation filters", () => {
    // start a custom question with orders
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Orders").click();

    // count orders by user id, filter to the one user with 46 orders
    cy.contains("Pick the metric").click();
    popover().within(() => {
      cy.findByText("Count of rows").click();
    });
    cy.contains("Pick a column to group by").click();
    popover().within(() => {
      cy.contains("User ID").click();
    });
    cy.icon("filter").click();
    popover().within(() => {
      cy.icon("int").click();
      cy.get("input").type("46");
      cy.contains("Add filter").click();
    });

    visualize();

    cy.contains("2372"); // user's id in the table
    cy.contains("Showing 1 row"); // ensure only one user was returned
  });

  it("shouldn't show sub-dimensions for FK (metabase#16787)", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByText("Summarize").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText("User ID")
      .closest(".List-item")
      .find(".Field-extra")
      .should("not.have.descendants", "*");
  });

  it("should show the original custom expression filter field on subsequent click (metabase#14726)", () => {
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          filter: ["between", ["field", ORDERS.ID, null], 96, 97],
        },
        type: "query",
      },
      display: "table",
    });

    cy.wait("@dataset");
    cy.findByText("ID between 96 97").click();
    cy.findByText("Between").click();
    popover().within(() => {
      cy.contains("Is not");
      cy.contains("Greater than");
      cy.contains("Less than");
    });
  });

  it("should append indexes to duplicate custom expression names (metabase#12104)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    openProductsTable({ mode: "notebook" });

    cy.findByText("Custom column").click();
    addSimpleCustomColumn("EXPR");

    getNotebookStep("expression").within(() => {
      cy.icon("add").click();
    });
    addSimpleCustomColumn("EXPR");

    getNotebookStep("expression").within(() => {
      cy.icon("add").click();
    });
    addSimpleCustomColumn("EXPR");

    getNotebookStep("expression").within(() => {
      cy.findByText("EXPR");
      cy.findByText("EXPR (1)");
      cy.findByText("EXPR (2)");
    });

    visualize();

    cy.findByText("EXPR");
    cy.findByText("EXPR (1)");
    cy.findByText("EXPR (2)");
  });

  it("should process the updated expression when pressing Enter", () => {
    openProductsTable({ mode: "notebook" });
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();
    enterCustomColumnDetails({ formula: "[Price] > 1" });

    cy.button("Done").click();

    // change the corresponding custom expression
    cy.findByText("Price is greater than 1").click();
    cy.get(".Icon-chevronleft").click();
    cy.findByText("Custom Expression").click();

    cy.get("@formula")
      .clear()
      .type("[Price] > 1 AND [Price] < 5{enter}");

    cy.contains(/^Price is less than 5/i);
  });

  it("should show the real number of rows instead of HARD_ROW_LIMIT when loading", () => {
    // start a custom question with orders
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Orders").click();

    // Add filter for ID < 100
    cy.findByText("Add filters to narrow your answer").click();
    cy.findByText("Custom Expression").click();
    enterCustomColumnDetails({ formula: "ID < 100" });
    cy.button("Done")
      .should("not.be.disabled")
      .click();

    visualize();

    cy.contains("Showing 99 rows");

    const req = interceptPromise("POST", "/api/dataset");
    cy.contains("ID is less than 100").click();
    cy.get(".Icon-chevronleft").click();
    cy.findByText("Custom Expression").click();
    cy.get("@formula")
      .clear()
      .type("ID < 2010");
    cy.button("Done").click();
    cy.contains("Showing 99 rows");
    req.resolve();
    cy.contains("Showing first 2000 rows");
  });

  // flaky test (#19454)
  it.skip("should show an info popover for dimensions listened by the custom expression editor", () => {
    // start a custom question with orders
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Orders").click();

    // type a dimension name
    cy.findByText("Add filters to narrow your answer").click();
    cy.findByText("Custom Expression").click();
    enterCustomColumnDetails({ formula: "Total" });

    // hover over option in the suggestion list
    cy.findByTestId("expression-suggestions-list")
      .findByText("Total")
      .trigger("mouseenter");

    // confirm that the popover is shown
    popover().contains("The total billed amount.");
    popover().contains("80.36");
  });

  describe("joins", () => {
    it("should allow joins", () => {
      cy.intercept("/api/database/1/schema/PUBLIC").as("schema");

      // start a custom question with orders
      cy.visit("/question/new");
      cy.contains("Custom question").click();
      cy.contains("Sample Database").click();
      cy.contains("Orders").click();

      // join to Reviews on orders.product_id = reviews.product_id
      cy.icon("join_left_outer").click();
      cy.wait("@schema");

      popover()
        .contains("Reviews")
        .click();
      popover()
        .contains("Product ID")
        .click();
      popover()
        .contains("Product ID")
        .click();

      // get the average rating across all rows (not a useful metric)
      cy.contains("Pick the metric you want to see").click();
      popover()
        .contains("Average of")
        .click();
      popover()
        .find(".Icon-join_left_outer")
        .click();
      popover()
        .contains("Rating")
        .click();

      visualize();

      cy.findByTestId("question-table-badges").within(() => {
        cy.findByText("Orders");
        cy.findByText("Reviews");
      });

      cy.contains("3");
    });

    it("should allow post-join filters (metabase#12221)", () => {
      cy.intercept("/api/database/1/schema/PUBLIC").as("schema");

      cy.log("Start a custom question with Orders");
      cy.visit("/question/new");
      cy.findByText("Custom question").click();
      cy.findByTextEnsureVisible("Sample Database").click();
      cy.findByTextEnsureVisible("Orders").click();

      cy.log("Join to People table using default settings");
      cy.icon("join_left_outer ").click();
      cy.wait("@schema");
      cy.contains("People").click();

      cy.findByTestId("question-table-badges").within(() => {
        cy.findByText("Orders");
        cy.findByText("People");
      });

      visualize();

      cy.contains("Showing first 2,000");

      cy.log("Attempt to filter on the joined table");
      cy.contains("Filter").click();
      cy.contains("Email").click();
      cy.contains("People – Email");
      cy.findByPlaceholderText("Search by Email")
        .type("wo")
        .then($el => {
          // This test was flaking due to a race condition with typing.
          // We're ensuring that the value entered was correct and are retrying if it wasn't
          const value = $el[0].value;
          const input = cy.wrap($el);
          if (value !== "wo") {
            input.clear().type("wo");
          }
        });
      cy.findByText("wolf.dina@yahoo.com").click();
      cy.button("Add filter").click();
      cy.contains("Showing 1 row");
    });

    it("should join on field literals", () => {
      cy.intercept("/api/database/1/schema/PUBLIC").as("schema");

      // create two native questions
      cy.createNativeQuestion({
        name: "question a",
        native: { query: "select 'foo' as a_column" },
      });

      cy.createNativeQuestion({
        name: "question b",
        native: { query: "select 'foo' as b_column" },
      });

      // start a custom question with question a
      cy.visit("/question/new");
      cy.findByText("Custom question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("question a").click();

      // join to question b
      cy.icon("join_left_outer").click();
      cy.wait("@schema");

      popover().within(() => {
        cy.findByTextEnsureVisible("Sample Database").click();
        cy.findByTextEnsureVisible("Saved Questions").click();
        cy.findByText("question b").click();
      });

      // select the join columns
      popover().within(() => cy.findByText("A_COLUMN").click());
      popover().within(() => cy.findByText("B_COLUMN").click());

      visualize();

      // check that query worked

      cy.findByTestId("question-table-badges").within(() => {
        cy.findByText("question a");
        cy.findByText("question b");
      });
      cy.findByText("A_COLUMN");
      cy.findByText("Question 5 → B Column");
      cy.findByText("Showing 1 row");
    });

    it("should allow joins based on saved questions (metabase#13000)", () => {
      // pass down a joined question alias
      joinTwoSavedQuestions();
    });

    // NOTE: - This repro is really tightly coupled to the `joinTwoSavedQuestions()` function.
    //       - Be extremely careful when changing any of the steps within that function.
    //       - The alternative approach would have been to write one longer repro instead of two separate ones.
    it("joined questions should create custom column (metabase#13649)", () => {
      // pass down a joined question alias
      joinTwoSavedQuestions();

      // add a custom column on top of the steps from the #13000 repro which was simply asserting
      // that a question could be made by joining two previously saved questions
      cy.icon("add_data").click();

      popover().within(() => {
        enterCustomColumnDetails({
          formula: "[Question 5 → sum] / [Sum of Rating]",
        });

        cy.findByPlaceholderText("Something nice and descriptive").type(
          "Sum Divide",
        );

        cy.button("Done")
          .should("not.be.disabled")
          .click();
      });

      visualize();

      cy.findByText("Sum Divide");
    });

    it("should show correct column title with foreign keys (metabase#11452)", () => {
      // (Orders join Reviews on Product ID)
      openOrdersTable({ mode: "notebook" });

      cy.findByText("Join data").click();
      cy.findByText("Reviews").click();
      cy.findByText("Product ID").click();
      popover().within(() => {
        cy.findByText("Product ID").click();
      });

      cy.log("It shouldn't use FK for a column title");
      cy.findByText("Summarize").click();
      cy.findByText("Pick a column to group by").click();

      // NOTE: Since there is no better way to "get" the element we need, below is a representation of the current DOM structure.
      //       This can also be useful because some future DOM changes could easily introduce a flake.
      //  the common parent
      //    wrapper for the icon
      //      the actual svg icon with the class `.Icon-join_left_outer`
      //    h3.List-section-title with the text content we're actually testing
      popover().within(() => {
        cy.icon("join_left_outer")
          .parent()
          .next()
          // NOTE from Flamber's warning:
          // this name COULD be "normalized" to "Review - Product" instead of "Reviews - Products" - that's why we use Regex match here
          .invoke("text")
          .should("match", /reviews? - products?/i);
      });
    });

    it("should join saved questions that themselves contain joins (metabase#12928)", () => {
      cy.intercept("/api/database/1/schema/PUBLIC").as("schema");

      // Save Question 1
      cy.createQuestion({
        name: "12928_Q1",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
            ["field", PEOPLE.SOURCE, { "join-alias": "People - User" }],
          ],
          joins: [
            {
              alias: "Products",
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Products" }],
              ],
              fields: "all",
              "source-table": PRODUCTS_ID,
            },
            {
              alias: "People - User",
              condition: [
                "=",
                ["field", ORDERS.USER_ID, null],
                ["field", PEOPLE.ID, { "join-alias": "People - User" }],
              ],
              fields: "all",
              "source-table": PEOPLE_ID,
            },
          ],
        },
      });

      // Save Question 2
      cy.createQuestion({
        name: "12928_Q2",
        query: {
          "source-table": REVIEWS_ID,
          aggregation: [["avg", ["field", REVIEWS.RATING, null]]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
          ],
          joins: [
            {
              alias: "Products",
              condition: [
                "=",
                ["field", REVIEWS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Products" }],
              ],
              fields: "all",
              "source-table": PRODUCTS_ID,
            },
          ],
        },
      });

      // Join two previously saved questions
      openNotebookEditor();
      cy.findByText("Saved Questions").click();

      cy.findByText("12928_Q1").click();

      cy.icon("join_left_outer").click();
      cy.wait("@schema");

      popover().within(() => {
        cy.findByTextEnsureVisible("Sample Database").click();
        cy.findByTextEnsureVisible("Saved Questions").click();
      });
      cy.findByText("12928_Q2").click();

      cy.contains(/Products? → Category/).click();

      popover()
        .contains(/Products? → Category/)
        .click();

      visualize();

      cy.log("Reported failing in v1.35.4.1 and `master` on July, 16 2020");

      cy.findByTestId("question-table-badges").within(() => {
        cy.findByText("12928_Q1");
        cy.findByText("12928_Q2");
      });

      cy.findAllByText(/Products? → Category/).should("have.length", 2);
    });

    it("should join saved question with sorted metric (metabase#13744)", () => {
      cy.server();
      // create first question based on repro steps in #13744
      cy.createQuestion({
        name: "13744",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
          "order-by": [["asc", ["aggregation", 0]]],
        },
      }).then(({ body: { id: questionId } }) => {
        const ALIAS = `Question ${questionId}`;

        // create new question and join it with a previous one
        cy.createQuestion({
          name: "13744_joined",
          query: {
            joins: [
              {
                alias: ALIAS,
                fields: "all",
                condition: [
                  "=",
                  ["field", PRODUCTS.CATEGORY, null],
                  [
                    "field",
                    "CATEGORY",
                    { "base-type": "type/Text", "join-alias": ALIAS },
                  ],
                ],
                "source-table": `card__${questionId}`,
              },
            ],
            "source-table": PRODUCTS_ID,
          },
        }).then(({ body: { id: joinedQuestionId } }) => {
          // listen on the final card query which means the data for this question loaded
          cy.route("POST", `/api/card/${joinedQuestionId}/query`).as(
            "cardQuery",
          );

          // Assert phase begins here
          cy.visit(`/question/${joinedQuestionId}`);
          cy.findByText("13744_joined");

          cy.log("Reported failing on v0.34.3 - v0.37.0.2");
          cy.log("Reported error log: 'No aggregation at index: 0'");
          // assert directly on XHR instead of relying on UI
          cy.wait("@cardQuery").then(xhr => {
            expect(xhr.response.body.error).not.to.exist;
          });
          cy.findAllByText("Gizmo");
        });
      });
    });

    it("should be able to do subsequent aggregation on a custom expression (metabase#14649)", () => {
      cy.createQuestion({
        name: "14649_min",
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "aggregation-options",
                ["sum", ["field", ORDERS.SUBTOTAL, null]],
                { name: "Revenue", "display-name": "Revenue" },
              ],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          aggregation: [
            ["min", ["field", "Revenue", { "base-type": "type/Float" }]],
          ],
        },

        display: "scalar",
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.server();
        cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

        cy.visit(`/question/${QUESTION_ID}`);
        cy.wait("@cardQuery").then(xhr => {
          expect(xhr.response.body.error).to.not.exist;
        });

        cy.findByText("49.54");
      });
    });

    it("x-rays should work on explicit joins when metric is for the joined table (metabase#14793)", () => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");
      cy.route("GET", "/api/automagic-dashboards/adhoc/**").as("xray");

      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": REVIEWS_ID,
            joins: [
              {
                fields: "all",
                "source-table": PRODUCTS_ID,
                condition: [
                  "=",
                  ["field", REVIEWS.PRODUCT_ID, null],
                  ["field", PRODUCTS.ID, { "join-alias": "Products" }],
                ],
                alias: "Products",
              },
            ],
            aggregation: [
              ["sum", ["field", PRODUCTS.PRICE, { "join-alias": "Products" }]],
            ],
            breakout: [
              ["field", REVIEWS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          database: 1,
        },
        display: "line",
      });

      cy.wait("@dataset");
      cy.get(".dot")
        .eq(2)
        .click({ force: true });
      cy.findByText("X-ray").click();

      cy.wait("@xray").then(xhr => {
        expect(xhr.response.body.cause).not.to.exist;
        expect(xhr.status).not.to.eq(500);
      });
      // Main title
      cy.contains(/^A closer look at/);
      // Metric title
      cy.findByText("How this metric is distributed across different numbers");
      // Make sure at least one card is rendered
      cy.get(".DashCard");
    });

    it("should handle ad-hoc question with old syntax (metabase#15372)", () => {
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            filter: ["=", ["field-id", ORDERS.USER_ID], 1],
          },
          database: 1,
        },
      });

      cy.findByText("User ID is 1");
      cy.findByText("37.65");
    });

    it("breakout binning popover should have normal height even when it's rendered lower on the screen (metabase#15445)", () => {
      cy.visit("/question/1/notebook");
      cy.findByText("Summarize").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();
      cy.findByText("Created At")
        .closest(".List-item")
        .findByText("by month")
        .click({ force: true });
      // First a reality check - "Minute" is the only string visible in UI and this should pass
      cy.findAllByText("Minute")
        .first() // TODO: cy.findAllByText(string).first() is necessary workaround that will be needed ONLY until (metabase#15570) gets fixed
        .isVisibleInPopover();
      // The actual check that will fail until this issue gets fixed
      cy.findAllByText("Week")
        .first()
        .isVisibleInPopover();
    });

    it("should add numeric filter on joined table (metabase#15570)", () => {
      cy.createQuestion({
        name: "15570",
        query: {
          "source-table": PRODUCTS_ID,
          joins: [
            {
              fields: "all",
              "source-table": ORDERS_ID,
              condition: [
                "=",
                ["field", PRODUCTS.ID, null],
                ["field", ORDERS.PRODUCT_ID, { "join-alias": "Orders" }],
              ],
              alias: "Orders",
            },
          ],
        },
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.visit(`/question/${QUESTION_ID}/notebook`);
      });
      cy.findByText("Filter").click();
      popover().within(() => {
        cy.findByText(/Orders/i).click();
        cy.findByText("Discount").click();
      });
      cy.findAllByTestId("select-button")
        .contains("Equal to")
        .click();
      cy.findByText("Greater than").click();
      cy.findByPlaceholderText("Enter a number").type(0);
      cy.button("Add filter")
        .should("not.be.disabled")
        .click();
    });
  });

  describe.skip("popover rendering issues (metabase#15502)", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      cy.viewport(1280, 720);
      cy.visit("/question/new");
      cy.findByText("Custom question").click();
      cy.findByTextEnsureVisible("Sample Database").click();
      cy.findByTextEnsureVisible("Orders").click();
    });

    it("popover should not render outside of viewport regardless of the screen resolution (metabase#15502-1)", () => {
      // Initial filter popover usually renders correctly within the viewport
      cy.findByText("Add filters to narrow your answer")
        .as("filter")
        .click();
      popover().isRenderedWithinViewport();
      // Click anywhere outside this popover to close it because the issue with rendering happens when popover opens for the second time
      cy.icon("gear").click();
      cy.get("@filter").click();
      popover().isRenderedWithinViewport();
    });

    it("popover should not cover the button that invoked it (metabase#15502-2)", () => {
      // Initial summarize/metric popover usually renders initially without blocking the button
      cy.findByText("Pick the metric you want to see")
        .as("metric")
        .click();
      // Click outside to close this popover
      cy.icon("gear").click();
      // Popover invoked again blocks the button making it impossible to click the button for the third time
      cy.get("@metric").click();
      cy.get("@metric").click();
    });
  });

  describe("nested", () => {
    it("should create a nested question with post-aggregation filter", () => {
      openProductsTable({ mode: "notebook" });

      cy.findByText("Summarize").click();
      popover().within(() => {
        cy.findByText("Count of rows").click();
      });

      cy.findByText("Pick a column to group by").click();
      popover().within(() => {
        cy.findByText("Category").click();
      });

      cy.findByText("Filter").click();
      popover().within(() => {
        cy.findByText("Category").click();
        cy.findByText("Gadget").click();
        cy.findByText("Add filter").click();
      });

      visualize();

      cy.findByText("Gadget").should("exist");
      cy.findByText("Gizmo").should("not.exist");

      cy.findByText("Save").click();

      modal().within(() => {
        cy.findByLabelText("Name").type("post aggregation");
        cy.findByText("Save").click();
      });

      cy.findByText("Not now").click();

      cy.icon("notebook").click();

      cy.reload();

      cy.findByText("Category").should("exist");
      cy.findByText("Category is Gadget").should("exist");
    });
  });

  describe("arithmetic (metabase#13175)", () => {
    beforeEach(() => {
      openOrdersTable({ mode: "notebook" });
    });

    it("should work on custom column with `case`", () => {
      cy.icon("add_data").click();

      enterCustomColumnDetails({
        formula: "case([Subtotal] + Tax > 100, 'Big', 'Small')",
      });

      cy.findByPlaceholderText("Something nice and descriptive")
        .click()
        .type("Example", { delay: 100 });

      cy.button("Done")
        .should("not.be.disabled")
        .click();

      visualize();

      cy.contains("Example");
      cy.contains("Big");
      cy.contains("Small");
    });

    it("should work on custom filter", () => {
      cy.findByText("Filter").click();
      cy.findByText("Custom Expression").click();

      enterCustomColumnDetails({ formula: "[Subtotal] - Tax > 140" });

      cy.contains(/^redundant input/i).should("not.exist");

      cy.button("Done")
        .should("not.be.disabled")
        .click();

      visualize();

      cy.contains("Showing 97 rows");
    });

    const CASES = {
      CountIf: ["CountIf(([Subtotal] + [Tax]) > 10)", "18,760"],
      SumIf: ["SumIf([Subtotal], ([Subtotal] + [Tax] > 20))", "1,447,850.28"],
    };

    Object.entries(CASES).forEach(([filter, formula]) => {
      const [expression, result] = formula;

      it(`should work on custom aggregation with ${filter}`, () => {
        cy.findByText("Summarize").click();
        cy.findByText("Custom Expression").click();

        enterCustomColumnDetails({ formula: expression });

        cy.findByPlaceholderText("Name (required)")
          .click()
          .type(filter, { delay: 100 });

        cy.contains(/^expected closing parenthesis/i).should("not.exist");
        cy.contains(/^redundant input/i).should("not.exist");

        cy.button("Done")
          .should("not.be.disabled")
          .click();

        visualize();

        cy.contains(filter);
        cy.contains(result);
      });
    });
  });

  // intentional simplification of "Select none" to quickly
  // fix users' pain caused by the inability to unselect all columns
  it("select no columns select the first one", () => {
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Orders").click();
    cy.findByTestId("fields-picker").click();

    popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByLabelText("ID").should("be.disabled");
      cy.findByText("Tax").click();
      cy.findByLabelText("ID")
        .should("be.enabled")
        .click();
    });

    visualize();

    cy.findByText("Tax");
    cy.findByText("ID").should("not.exist");
  });

  // flaky test
  it.skip("should show an info popover when hovering over a field picker option for a table", () => {
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Orders").click();

    cy.findByTestId("fields-picker").click();

    cy.findByText("Total").trigger("mouseenter");

    popover().contains("The total billed amount.");
    popover().contains("80.36");
  });

  // flaky test
  it.skip("should show an info popover when hovering over a field picker option for a saved question", () => {
    cy.createNativeQuestion({
      name: "question a",
      native: { query: "select 'foo' as a_column" },
    });

    // start a custom question with question a
    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("question a").click();

    cy.findByTestId("fields-picker").click();

    cy.findByText("A_COLUMN").trigger("mouseenter");

    popover().contains("A_COLUMN");
    popover().contains("No description");
  });
});

// Extracted repro steps for #13000
function joinTwoSavedQuestions() {
  cy.createQuestion({
    name: "Q1",
    query: {
      aggregation: ["sum", ["field", ORDERS.TOTAL, null]],
      breakout: [["field", ORDERS.PRODUCT_ID, null]],
      "source-table": ORDERS_ID,
    },
  }).then(() => {
    cy.createQuestion({
      name: "Q2",
      query: {
        aggregation: ["sum", ["field", PRODUCTS.RATING, null]],
        breakout: [["field", PRODUCTS.ID, null]],
        "source-table": PRODUCTS_ID,
      },
    }).then(() => {
      cy.intercept("/api/database/1/schema/PUBLIC").as("schema");
      cy.visit(`/question/new`);
      cy.findByText("Custom question").click();

      popover().within(() => {
        cy.findByText("Saved Questions").click();
        cy.findByText("Q1").click();
      });

      cy.icon("join_left_outer").click();
      cy.wait("@schema");
      popover().within(() => {
        cy.icon("chevronleft").click();
        cy.findByText("Saved Questions").click();
        cy.findByText("Q2").click();
      });

      popover()
        .findByText("Product ID")
        .click();
      popover()
        .findByText("ID")
        .click();

      visualize();

      cy.icon("notebook").click();
      cy.url().should("contain", "/notebook");
    });
  });
}

function addSimpleCustomColumn(name) {
  enterCustomColumnDetails({ formula: "C" });
  cy.findByText("ategory").click();
  cy.findByPlaceholderText("Something nice and descriptive")
    .click()
    .type(name);
  cy.button("Done").click();
}
