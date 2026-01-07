interface ObservableAsyncGenerator<T> {
  next(...[value]: [] | [unknown]): Promise<IteratorResult<T, void>>;
  return(value: void | PromiseLike<void>): Promise<IteratorResult<T, void>>;
  throw(e: unknown): Promise<IteratorResult<T, void>>;
  [Symbol.asyncIterator](): ObservableGenerator<T>;
}
