import Link from "next/link";
import { home } from "@/site/copy";
import { examplePath, type Example } from "@/site/examples";
import { MiniPicture } from "./mini-pictures";
import { Icon, Stamp } from "./parts";

// The questions list (spec 7.2.5): one link a row, with the stamp and category, the question and its hook, a mini
// picture of the widget and "Play →". Home shows it whole; Examples hides rows by filter with the `hidden` attribute.
// Server-safe and free of hooks, so the Examples filter can draw it from the browser too.

export function QuestionList({ examples, hidden }: { examples: readonly Example[]; hidden?: ReadonlySet<string> }) {
  return (
    <ul className="v-qlist">
      {examples.map((example) => (
        <li key={example.slug} hidden={hidden?.has(example.slug)} data-group={example.group}>
          <Link href={examplePath(example.slug)} className="v-qrow">
            <span className="meta">
              <Stamp>{example.stamp}</Stamp>
              <span className="v-fine">{example.category}</span>
            </span>
            <span>
              <span className="q">{example.question}</span>
              <span className="hook">{example.hook}</span>
            </span>
            <MiniPicture kind={example.widget} id={`mini-${example.slug}`} />
            <span className="play">
              {home.questions.play}
              <Icon name="arrow" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
