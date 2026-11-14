import {
  AlarmClock, ArrowRightLeft, Ban, Banknote, BanknoteArrowUp, BatteryFull, BatteryLow, Bird, Bomb, BookA, BookOpen,
  Brain, Briefcase, Building, BuildingComplex, Calendar, Calendar1, CalendarDays, ChartColumn, ChartLine, ChefHat,
  CircleCheck, CircleDollarSign, CircleExclamationPoint, CircleQuestionMark, CircleX, ClipboardList, CloudLightning,
  Coffee, Cog, Coins, Construction, CreditCard, Crown, Dices, Droplet, Earth, Egg, Euro, Eye, FaceExpressionless,
  FaceGrinning, FaceNeutral, FaceSlightlyFrowning, FaceSlightlySmiling, Factory, Fish, Flame, Fuel, Gavel, Gem, Gift,
  Glasses, GraduationCap, Hand, HardHat, Hourglass, House, Houses, IdCard, JapaneseYen, Key, KeyRound, Landmark,
  Laptop, Lightbulb, Link as LinkIcon, Link2, ListOrdered, Lock, LockOpen, Mail, Map as MapIcon, Megaphone,
  MessageCircle, MessageCircleMore, MessageCircleOff, Microscope, Newspaper, Notebook, NotebookText, NotepadText,
  OctagonX, Package, PartyPopper, Phone, Plane, PoundSterling, Puzzle, Rabbit, Rainbow, Receipt, Rocket, Scale, School,
  ScrollText, Search, Shapes, Shield, ShieldUser, Ship, ShoppingBag, ShoppingCart, Sigma, Siren, Smartphone, Snail,
  Snowflake, Sparkles, Sprout, Star, Store, Sun, Tag, Target, Ticket, Timer, Tornado, Tractor, TreeDeciduous,
  TrendingDown, TrendingUp, TriangleExclamationPoint, Trophy, Truck, Turtle, Umbrella, UserRound, UserSearch, Users,
  Volume2, Wallet, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { ICON_SET, isIconName, type Drawing, type IconName } from "./names";

export const ICON_SIZES = [16, 20, 24, 32, 48, 64] as const;
export type IconSize = (typeof ICON_SIZES)[number];

/**
 * Each drawing the Icon set uses (src/icons/names.ts), as its lucide-react 1.71.0 component, by its kebab name. A missing
 * or an extra drawing is a type error. `Map` and `Link` come in as `MapIcon` and `LinkIcon`, so the globals are not shadowed.
 */
export const DRAWINGS = {
  "alarm-clock": AlarmClock,
  "arrow-right-left": ArrowRightLeft,
  "ban": Ban,
  "banknote": Banknote,
  "banknote-arrow-up": BanknoteArrowUp,
  "battery-full": BatteryFull,
  "battery-low": BatteryLow,
  "bird": Bird,
  "bomb": Bomb,
  "book-a": BookA,
  "book-open": BookOpen,
  "brain": Brain,
  "briefcase": Briefcase,
  "building": Building,
  "building-complex": BuildingComplex,
  "calendar": Calendar,
  "calendar-1": Calendar1,
  "calendar-days": CalendarDays,
  "chart-column": ChartColumn,
  "chart-line": ChartLine,
  "chef-hat": ChefHat,
  "circle-check": CircleCheck,
  "circle-dollar-sign": CircleDollarSign,
  "circle-exclamation-point": CircleExclamationPoint,
  "circle-question-mark": CircleQuestionMark,
  "circle-x": CircleX,
  "clipboard-list": ClipboardList,
  "cloud-lightning": CloudLightning,
  "coffee": Coffee,
  "cog": Cog,
  "coins": Coins,
  "construction": Construction,
  "credit-card": CreditCard,
  "crown": Crown,
  "dices": Dices,
  "droplet": Droplet,
  "earth": Earth,
  "egg": Egg,
  "euro": Euro,
  "eye": Eye,
  "face-expressionless": FaceExpressionless,
  "face-grinning": FaceGrinning,
  "face-neutral": FaceNeutral,
  "face-slightly-frowning": FaceSlightlyFrowning,
  "face-slightly-smiling": FaceSlightlySmiling,
  "factory": Factory,
  "fish": Fish,
  "flame": Flame,
  "fuel": Fuel,
  "gavel": Gavel,
  "gem": Gem,
  "gift": Gift,
  "glasses": Glasses,
  "graduation-cap": GraduationCap,
  "hand": Hand,
  "hard-hat": HardHat,
  "hourglass": Hourglass,
  "house": House,
  "houses": Houses,
  "id-card": IdCard,
  "japanese-yen": JapaneseYen,
  "key": Key,
  "key-round": KeyRound,
  "landmark": Landmark,
  "laptop": Laptop,
  "lightbulb": Lightbulb,
  "link": LinkIcon,
  "link-2": Link2,
  "list-ordered": ListOrdered,
  "lock": Lock,
  "lock-open": LockOpen,
  "mail": Mail,
  "map": MapIcon,
  "megaphone": Megaphone,
  "message-circle": MessageCircle,
  "message-circle-more": MessageCircleMore,
  "message-circle-off": MessageCircleOff,
  "microscope": Microscope,
  "newspaper": Newspaper,
  "notebook": Notebook,
  "notebook-text": NotebookText,
  "notepad-text": NotepadText,
  "octagon-x": OctagonX,
  "package": Package,
  "party-popper": PartyPopper,
  "phone": Phone,
  "plane": Plane,
  "pound-sterling": PoundSterling,
  "puzzle": Puzzle,
  "rabbit": Rabbit,
  "rainbow": Rainbow,
  "receipt": Receipt,
  "rocket": Rocket,
  "scale": Scale,
  "school": School,
  "scroll-text": ScrollText,
  "search": Search,
  "shapes": Shapes,
  "shield": Shield,
  "shield-user": ShieldUser,
  "ship": Ship,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  "sigma": Sigma,
  "siren": Siren,
  "smartphone": Smartphone,
  "snail": Snail,
  "snowflake": Snowflake,
  "sparkles": Sparkles,
  "sprout": Sprout,
  "star": Star,
  "store": Store,
  "sun": Sun,
  "tag": Tag,
  "target": Target,
  "ticket": Ticket,
  "timer": Timer,
  "tornado": Tornado,
  "tractor": Tractor,
  "tree-deciduous": TreeDeciduous,
  "trending-down": TrendingDown,
  "trending-up": TrendingUp,
  "triangle-exclamation-point": TriangleExclamationPoint,
  "trophy": Trophy,
  "truck": Truck,
  "turtle": Turtle,
  "umbrella": Umbrella,
  "user-round": UserRound,
  "user-search": UserSearch,
  "users": Users,
  "volume-2": Volume2,
  "wallet": Wallet,
  "wrench": Wrench,
  "zap": Zap,
} satisfies Record<Drawing, LucideIcon>;

const warned = new Set<string>();

/**
 * One line Icon from the named set (spec 2026-11-11, ticket A1a, ADR 0014): Lucide's svg at stroke 1.75 in the text
 * colour (`stroke="currentColor"`), the header's own geometry. From 32 px up the stroke does not scale, so a Story cast
 * drawn at 112 px keeps a 1.75 px line. Decorative by default (`aria-hidden`, `focusable="false"`); give `label` text, or
 * `label` true for the set's own alt, when the picture carries meaning: then it is `role="img"` with that `aria-label`.
 * An unknown name is a type error; at runtime it renders nothing and warns once.
 */
export function Icon({ name, size, label, className }: { name: IconName; size: IconSize; label?: string | true; className?: string }) {
  if (!isIconName(name)) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`<Icon>: "${name}" is not in src/icons/names.ts`);
    }
    return null;
  }
  const entry = ICON_SET[name];
  const Drawn = DRAWINGS[entry.drawing];
  const a11y = label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label === true ? entry.alt : label };
  return (
    <Drawn
      data-icon={name}
      size={size}
      strokeWidth={1.75}
      nonScalingStroke={size >= 32}
      focusable="false"
      className={className}
      {...a11y}
    />
  );
}
