import { Block, Page } from "./Shared";
import { usePageTitle } from "../../lib/usePageTitle";

// Plain statements of what this website actually does. The school should have a lawyer review this before launch.
export default function Privacy() {
  usePageTitle("Privacy notice");
  return (
    <Page
      title="Privacy notice"
      intro="How [School Name] uses the details you send through this website."
    >
      <Block title="What we collect and why">
        <p>
          <strong>Admission applications:</strong> the child's name, date of
          birth and class applied for; the parent or guardian's name, phone
          number and email address; and, if you choose to give them, the
          previous school, home address and a message. We use these only to
          consider the application and to contact the family about it.
        </p>
        <p>
          <strong>Contact messages:</strong> your name, email address, optional
          phone number and your message. We use them only to reply to you.
        </p>
      </Block>
      <Block title="Who can see it">
        <p>
          Only the school's administrators. Applications and messages are never
          shown on the public website, and they are not sold or shared for
          advertising.
        </p>
      </Block>
      <Block title="Payments">
        <p>
          Fees are paid on Paystack's own page. The school never sees or stores
          card details.
        </p>
      </Block>
      <Block title="Your rights">
        <p>
          Under the Nigeria Data Protection Act 2023 you can ask the school what
          it holds about you or your child, ask for mistakes to be corrected,
          and ask for details to be deleted where the law allows. Contact the
          school using the details on the{" "}
          <a className="font-medium text-brand-700 underline" href="/contact">
            contact page
          </a>
          .
        </p>
      </Block>
      <Block title="How long we keep it">
        <p>
          [Placeholder] The school should state here how long it keeps
          applications and messages.
        </p>
      </Block>
    </Page>
  );
}
