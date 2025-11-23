
export class Base<T> {
  data: T;
}

export class ConcreteString extends Base<string> {
  other: number;
}
