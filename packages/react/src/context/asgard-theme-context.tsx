import {
  createContext,
  CSSProperties,
  PropsWithChildren,
  ReactNode,
  useContext,
  useMemo,
  useCallback,
} from 'react';
import { deepMerge } from 'src/utils/deep-merge';
import {
  useAsgardAppInitializationContext,
  Annotations,
} from 'src/context/asgard-app-initialization-context';

export interface AsgardThemeContextValue {
  chatbot: Pick<
    CSSProperties,
    | 'width'
    | 'height'
    | 'maxWidth'
    | 'minWidth'
    | 'maxHeight'
    | 'minHeight'
    | 'backgroundColor'
    | 'borderColor'
    | 'borderRadius'
  > & {
    contentMaxWidth?: CSSProperties['maxWidth'];
    backgroundColor?: CSSProperties['backgroundColor'];
    borderColor?: CSSProperties['borderColor'];
    inactiveColor?: CSSProperties['color'];
    primaryComponent?: {
      mainColor?: CSSProperties['color'];
      secondaryColor?: CSSProperties['color'];
    };
    style?: CSSProperties;
    header?: Partial<{
      style: CSSProperties;
      title: {
        style: CSSProperties;
      };
      actionButton?: {
        style: CSSProperties;
      };
    }>;
    body?: Partial<{
      style: CSSProperties;
    }>;
    footer?: Partial<{
      style: CSSProperties;
      textArea: {
        style: CSSProperties;
        '::placeholder': CSSProperties;
      };
      submitButton: {
        style: CSSProperties;
      };
      speechInputButton: {
        style: CSSProperties;
      };
    }>;
  };
  botMessage: Pick<CSSProperties, 'color' | 'backgroundColor'>;
  userMessage: Pick<CSSProperties, 'color' | 'backgroundColor'>;
  template?: Partial<{
    /**
     * first level for common/shared properties.
     * Check MessageTemplate type for more details (packages/core/src/types/sse-response.ts).
     */
    quickReplies?: Partial<{
      style: CSSProperties;
      button: {
        style: CSSProperties;
      };
    }>;
    time?: Partial<{
      style: CSSProperties;
    }>;
    /**
     * TBD: Fill the necessary properties based on the requirements.
     */
    TextMessageTemplate: Partial<{ style: CSSProperties }>;
    /**
     * TBD: Fill the necessary properties based on the requirements.
     */
    HintMessageTemplate: Partial<{ style: CSSProperties }>;
    /**
     * TBD: Fill the necessary properties based on the requirements.
     */
    ImageMessageTemplate: Partial<{ style: CSSProperties }>;
    /**
     * TBD: Fill the necessary properties based on the requirements.
     */
    VideoMessageTemplate: Partial<{ style: CSSProperties }>;
    /**
     * TBD: Fill the necessary properties based on the requirements.
     */
    AudioMessageTemplate: Partial<{ style: CSSProperties }>;
    /**
     * TBD: Fill the necessary properties based on the requirements.
     */
    LocationMessageTemplate: Partial<{ style: CSSProperties }>;
    /**
     * TBD: Fill the necessary properties based on the requirements.
     */
    ChartMessageTemplate: Partial<{ style: CSSProperties }>;
    /**
     * TBD: Fill the necessary properties based on the requirements.
     */
    ButtonMessageTemplate: Partial<{
      style: CSSProperties;
      button?: {
        style: CSSProperties;
      };
    }>;
    /**
     * TBD: Fill the necessary properties based on the requirements.
     */
    CarouselMessageTemplate: Partial<{
      style: CSSProperties;
      card: {
        style: CSSProperties;
        button?: {
          style: CSSProperties;
        };
      };
    }>;
  }>;
}

export const defaultAsgardThemeContextValue: AsgardThemeContextValue = {
  chatbot: {
    width: '375px',
    height: '640px',
    backgroundColor: 'var(--asg-color-bg)',
    borderColor: 'var(--asg-color-border)',
    borderRadius: 'var(--asg-radius-md)',
    contentMaxWidth: '1200px',
    style: {},
    header: {
      style: {},
      title: {
        style: {},
      },
      actionButton: {
        style: {},
      },
    },
    body: {
      style: {},
    },
    footer: {
      style: {},
      textArea: {
        style: {},
        '::placeholder': {
          color: 'var(--asg-color-text-placeholder)',
        },
      },
      submitButton: {
        style: {},
      },
      speechInputButton: {
        style: {},
      },
    },
  },
  botMessage: {
    color: 'var(--asg-color-text)',
    backgroundColor: 'var(--asg-color-secondary)',
  },
  userMessage: {
    color: 'var(--asg-color-text)',
    backgroundColor: 'var(--asg-color-primary)',
  },
  template: {
    quickReplies: {
      style: {},
      button: {
        style: {},
      },
    },
    time: {
      style: {},
    },
    TextMessageTemplate: {
      style: {},
    },
    HintMessageTemplate: {
      style: {},
    },
    ImageMessageTemplate: {
      style: {},
    },
    VideoMessageTemplate: {
      style: {},
    },
    AudioMessageTemplate: {
      style: {},
    },
    LocationMessageTemplate: {
      style: {},
    },
    ChartMessageTemplate: {
      style: {},
    },
    ButtonMessageTemplate: {
      style: {},
      button: {
        style: {
          border: '1px solid var(--asg-color-border)',
        },
      },
    },
    CarouselMessageTemplate: {
      style: {},
      card: {
        style: {},
        button: {
          style: {
            border: '1px solid var(--asg-color-border)',
          },
        },
      },
    },
  },
};

export const AsgardThemeContext = createContext<AsgardThemeContextValue>(
  defaultAsgardThemeContextValue
);

export function AsgardThemeContextProvider(
  props: PropsWithChildren<{
    theme?: Partial<AsgardThemeContextValue>;
  }>
): ReactNode {
  const { children, theme = {} } = props;
  const {
    data: { annotations },
  } = useAsgardAppInitializationContext();

  const deepMergeTheme = useCallback(
    function () {
      /**
       * Orders of theme (high to low):
       * 1. Theme from props
       * 2. Theme from annotations
       * 3. Default theme
       */

      const themeFromAnnotations: Annotations['embedConfig']['theme'] =
        annotations?.embedConfig?.theme ?? {
          chatbot: {},
          botMessage: {},
          userMessage: {},
        };

      const tempTheme = deepMerge(defaultAsgardThemeContextValue, {
        chatbot: {
          backgroundColor: themeFromAnnotations.chatbot?.backgroundColor,
          borderColor: themeFromAnnotations.chatbot?.borderColor,
          header: {
            style: {
              borderBottomColor: themeFromAnnotations.chatbot?.borderColor,
            },
            title: {
              style: {
                color:
                  themeFromAnnotations.chatbot?.primaryComponent
                    ?.secondaryColor, // Title text color
              },
            },
            actionButton: {
              style: {
                color: themeFromAnnotations.chatbot?.inactiveColor,
              },
            },
          },
          body: {
            style: {
              // Time/timestamp text color
              color: themeFromAnnotations.chatbot?.inactiveColor,
            },
          },
          footer: {
            style: {
              borderTopColor: themeFromAnnotations.chatbot?.borderColor,
            },
            textArea: {
              style: {
                color: themeFromAnnotations.chatbot?.inactiveColor,
                backgroundColor: themeFromAnnotations.chatbot?.backgroundColor,
              },
              '::placeholder': {
                color: themeFromAnnotations.chatbot?.inactiveColor,
              },
            },
            submitButton: {
              style: {
                color:
                  themeFromAnnotations.chatbot?.primaryComponent
                    ?.secondaryColor,
              },
            },
            speechInputButton: {
              style: {
                color:
                  themeFromAnnotations.chatbot?.primaryComponent
                    ?.secondaryColor,
              },
            },
          },
        },
        botMessage: {
          backgroundColor: themeFromAnnotations.botMessage?.backgroundColor, // #585858
          color: themeFromAnnotations.botMessage?.color,
        },
        userMessage: {
          backgroundColor: themeFromAnnotations.userMessage?.backgroundColor,
          color: themeFromAnnotations.userMessage?.color,
        },
        template: {
          quickReplies: {
            button: {
              style: {
                color:
                  themeFromAnnotations.chatbot?.primaryComponent
                    ?.secondaryColor, // Button text (#FFFFFF)
                borderColor: themeFromAnnotations.chatbot?.borderColor,
                backgroundColor: themeFromAnnotations.botMessage
                  ?.backgroundColor
                  ? `${themeFromAnnotations.botMessage.backgroundColor}33`
                  : undefined,
              },
            },
          },
          time: {
            style: {
              color: themeFromAnnotations.chatbot?.inactiveColor,
            },
          },
          TextMessageTemplate: {
            style: {
              // For unset messages
              color:
                themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor,
            },
          },
          ButtonMessageTemplate: {
            button: {
              style: {
                borderColor: themeFromAnnotations.chatbot?.borderColor,
                backgroundColor:
                  themeFromAnnotations.chatbot?.primaryComponent?.mainColor,
                color:
                  themeFromAnnotations.chatbot?.primaryComponent
                    ?.secondaryColor,
              },
            },
          },
          CarouselMessageTemplate: {
            card: {
              style: {
                backgroundColor:
                  themeFromAnnotations.botMessage
                    ?.carouselButtonBackgroundColor,
              },
              button: {
                style: {
                  borderColor: themeFromAnnotations.chatbot?.borderColor,
                  backgroundColor:
                    themeFromAnnotations.chatbot?.primaryComponent?.mainColor,
                  color:
                    themeFromAnnotations.chatbot?.primaryComponent
                      ?.secondaryColor,
                },
              },
            },
          },
        },
      });

      return deepMerge(tempTheme, theme);
    },
    [theme, annotations?.embedConfig?.theme]
  );

  const value = useMemo(() => deepMergeTheme(), [deepMergeTheme]);

  return (
    <AsgardThemeContext.Provider value={value}>
      {children}
    </AsgardThemeContext.Provider>
  );
}

export function useAsgardThemeContext(): AsgardThemeContextValue {
  return useContext(AsgardThemeContext);
}
