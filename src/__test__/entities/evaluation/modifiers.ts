
export class AccessorAndModifiers {
  public publicProp: string = 'public';
  
  private privateProp: string = 'private';
  
  protected protectedProp: string = 'protected';
  
  static staticProp: string = 'static';

  get computedProp(): string {
    return 'computed';
  }
}
