import type { ArticleTemplate } from "@/models";

export interface TemplateStore {
  save(template: ArticleTemplate): Promise<ArticleTemplate>;
  get(id: string): Promise<ArticleTemplate | null>;
  require(id: string): Promise<ArticleTemplate>;
  list(): Promise<ArticleTemplate[]>;
  delete(id: string): Promise<boolean>;
  close?(): Promise<void>;
}
