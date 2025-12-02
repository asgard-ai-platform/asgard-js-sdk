import { createContext, CSSProperties, PropsWithChildren, ReactNode, useContext, useMemo, useCallback } from 'react';
import { deepMerge } from '../utils/deep-merge';
import { darkenColor } from '../utils/color-utils';
import { useAsgardAppInitializationContext, Annotations } from './asgard-app-initialization-context';

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
    mainColor?: CSSProperties['color'];
    secondaryColor?: CSSProperties['color'];
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
      attachmentButton: {
        style: CSSProperties;
      };
      submitButton: {
        style: CSSProperties;
      };
      speechInputButton: {
        style: CSSProperties;
      };
    }>;
  };
  botMessage: Pick<CSSProperties, 'color' | 'backgroundColor'> & {
    carouselButtonBackgroundColor?: CSSProperties['backgroundColor'];
    linkColor?: CSSProperties['color'];
    unsentBackgroundColor?: CSSProperties['backgroundColor'];
    quickReplyBackgroundColor?: CSSProperties['backgroundColor'];
  };
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
    LocationMessageTemplate: Partial<{
      style: CSSProperties;
      title?: {
        style: CSSProperties;
      };
      description?: {
        style: CSSProperties;
      };
    }>;
    /**
     * TBD: Fill the necessary properties based on the requirements.
     */
    ChartMessageTemplate: Partial<{ style: CSSProperties }>;
    /**
     * TBD: Fill the necessary properties based on the requirements.
     */
    ButtonMessageTemplate: Partial<{
      style: CSSProperties;
      title?: {
        style: CSSProperties;
      };
      description?: {
        style: CSSProperties;
      };
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
        title?: {
          style: CSSProperties;
        };
        description?: {
          style: CSSProperties;
        };
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
      attachmentButton: {
        style: {},
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
      title: {
        style: {},
      },
      description: {
        style: {},
      },
    },
    ChartMessageTemplate: {
      style: {},
    },
    ButtonMessageTemplate: {
      style: {},
      title: {
        style: {},
      },
      description: {
        style: {},
      },
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
        title: {
          style: {},
        },
        description: {
          style: {},
        },
        button: {
          style: {
            border: '1px solid var(--asg-color-border)',
          },
        },
      },
    },
  },
};

export const AsgardThemeContext = createContext<AsgardThemeContextValue>(defaultAsgardThemeContextValue);

export function AsgardThemeContextProvider(
  props: PropsWithChildren<{
    theme?: Partial<AsgardThemeContextValue>;
  }>,
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

      const themeFromAnnotations: Annotations['embedConfig']['theme'] = annotations?.embedConfig?.theme ?? {
        chatbot: {},
        botMessage: {},
        userMessage: {},
      };

      const tempTheme = deepMerge(defaultAsgardThemeContextValue as unknown as Record<string, unknown>, {
        chatbot: {
          backgroundColor: themeFromAnnotations.chatbot?.backgroundColor,
          borderColor: themeFromAnnotations.chatbot?.borderColor,
          mainColor: themeFromAnnotations.chatbot?.primaryComponent?.mainColor,
          secondaryColor: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor,

          header: {
            style: {
              borderBottomColor: themeFromAnnotations.chatbot?.borderColor,
            },
            title: {
              style: {
                color: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor, // Title text color
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
                color: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor,
                backgroundColor: themeFromAnnotations.chatbot?.backgroundColor,
                borderColor: themeFromAnnotations.chatbot?.borderColor,
              },
              '::placeholder': {
                color: themeFromAnnotations.chatbot?.inactiveColor,
              },
            },
            attachmentButton: {
              style: {
                color: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor,
              },
            },
            submitButton: {
              style: {
                color: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor,
              },
            },
            speechInputButton: {
              style: {
                color: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor,
              },
            },
          },
        },
        botMessage: {
          backgroundColor: themeFromAnnotations.botMessage?.backgroundColor, // #585858
          color: themeFromAnnotations.botMessage?.color,
          linkColor: themeFromAnnotations.botMessage?.backgroundColor
            ? darkenColor(themeFromAnnotations.botMessage.backgroundColor, 0.2)
            : undefined,
          unsentBackgroundColor: themeFromAnnotations.botMessage?.backgroundColor
            ? `color-mix(in srgb, ${themeFromAnnotations.botMessage.backgroundColor} 20%, transparent)`
            : undefined,
          quickReplyBackgroundColor: themeFromAnnotations.botMessage?.backgroundColor
            ? `color-mix(in srgb, ${themeFromAnnotations.botMessage.backgroundColor} 20%, transparent)`
            : undefined,
        },
        userMessage: {
          backgroundColor: themeFromAnnotations.userMessage?.backgroundColor,
          color: themeFromAnnotations.userMessage?.color,
        },
        template: {
          quickReplies: {
            button: {
              style: {
                color: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor, // Button text (#FFFFFF)
                borderColor: themeFromAnnotations.chatbot?.borderColor,
                backgroundColor: themeFromAnnotations.botMessage?.backgroundColor
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
              color: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor,
            },
          },
          HintMessageTemplate: {
            style: {
              color: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor,
            },
          },
          ButtonMessageTemplate: {
            style: {
              backgroundColor: themeFromAnnotations.botMessage?.carouselButtonBackgroundColor,
            },
            title: {
              style: {
                color: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor,
              },
            },
            description: {
              style: {
                color: themeFromAnnotations.chatbot?.inactiveColor,
              },
            },
            button: {
              style: {
                borderColor: themeFromAnnotations.chatbot?.primaryComponent?.mainColor,
                backgroundColor: themeFromAnnotations.chatbot?.primaryComponent?.mainColor,
                color: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor,
              },
            },
          },
          CarouselMessageTemplate: {
            card: {
              style: {
                backgroundColor: themeFromAnnotations.botMessage?.carouselButtonBackgroundColor,
              },
              title: {
                style: {
                  color: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor,
                },
              },
              description: {
                style: {
                  color: themeFromAnnotations.chatbot?.inactiveColor,
                },
              },
              button: {
                style: {
                  borderColor: themeFromAnnotations.chatbot?.primaryComponent?.mainColor,
                  backgroundColor: themeFromAnnotations.chatbot?.primaryComponent?.mainColor,
                  color: themeFromAnnotations.chatbot?.primaryComponent?.secondaryColor,
                },
              },
            },
          },
        },
      });

      const mergedTheme = deepMerge(tempTheme, theme) as AsgardThemeContextValue;

      // Ensure prop-level chatbot.borderColor is also applied to nested styles
      if (theme?.chatbot?.borderColor) {
        const borderColor = theme.chatbot.borderColor;

        // Apply to header
        if (mergedTheme.chatbot.header?.style) {
          mergedTheme.chatbot.header.style.borderBottomColor = borderColor;
        }

        // Apply to footer
        if (mergedTheme.chatbot.footer?.style) {
          mergedTheme.chatbot.footer.style.borderTopColor = borderColor;
        }

        // Apply to textarea
        if (mergedTheme.chatbot.footer?.textArea?.style) {
          mergedTheme.chatbot.footer.textArea.style.borderColor = borderColor;
        }

        // Apply to quick reply buttons
        if (mergedTheme.template?.quickReplies?.button?.style) {
          mergedTheme.template.quickReplies.button.style.borderColor = borderColor;
        }
      }

      // Ensure prop-level chatbot.primaryComponent.secondaryColor is also applied to textarea text color and footer buttons
      if (theme?.chatbot?.primaryComponent?.secondaryColor) {
        const textColor = theme.chatbot.primaryComponent.secondaryColor;

        // Apply to textarea text color
        if (mergedTheme.chatbot.footer?.textArea?.style) {
          mergedTheme.chatbot.footer.textArea.style.color = textColor;
        }

        // Apply to attachment button color
        if (mergedTheme.chatbot.footer?.attachmentButton?.style) {
          mergedTheme.chatbot.footer.attachmentButton.style.color = textColor;
        }

        // Apply to submit button color
        if (mergedTheme.chatbot.footer?.submitButton?.style) {
          mergedTheme.chatbot.footer.submitButton.style.color = textColor;
        }

        // Apply to speech input button color
        if (mergedTheme.chatbot.footer?.speechInputButton?.style) {
          mergedTheme.chatbot.footer.speechInputButton.style.color = textColor;
        }
      }

      // Ensure prop-level chatbot.inactiveColor is also applied to placeholder color
      if (theme?.chatbot?.inactiveColor) {
        const placeholderColor = theme.chatbot.inactiveColor;

        // Apply to textarea placeholder color
        if (mergedTheme.chatbot.footer?.textArea?.['::placeholder']) {
          mergedTheme.chatbot.footer.textArea['::placeholder'].color = placeholderColor;
        }
      }

      // Ensure prop-level chatbot.backgroundColor is also applied to textarea background
      if (theme?.chatbot?.backgroundColor) {
        const bgColor = theme.chatbot.backgroundColor;

        // Apply to textarea background color
        if (mergedTheme.chatbot.footer?.textArea?.style) {
          mergedTheme.chatbot.footer.textArea.style.backgroundColor = bgColor;
        }
      }

      // Ensure prop-level chatbot.inactiveColor is also applied to time color
      if (theme?.chatbot?.inactiveColor) {
        if (mergedTheme.template?.time?.style) {
          mergedTheme.template.time.style.color = theme.chatbot.inactiveColor;
        }

        // Apply to header action buttons (refresh, close)
        if (mergedTheme.chatbot.header?.actionButton?.style) {
          mergedTheme.chatbot.header.actionButton.style.color = theme.chatbot.inactiveColor;
        }
      }

      // Ensure prop-level botMessage.carouselButtonBackgroundColor is also applied to card backgrounds
      if (theme?.botMessage?.carouselButtonBackgroundColor) {
        const cardBgColor = theme.botMessage.carouselButtonBackgroundColor;

        // Apply to button template card background color
        if (mergedTheme.template?.ButtonMessageTemplate?.style) {
          mergedTheme.template.ButtonMessageTemplate.style.backgroundColor = cardBgColor;
        }

        // Apply to carousel card background color
        if (mergedTheme.template?.CarouselMessageTemplate?.card?.style) {
          mergedTheme.template.CarouselMessageTemplate.card.style.backgroundColor = cardBgColor;
        }

        // Apply to location template card background color
        if (mergedTheme.template?.LocationMessageTemplate?.style) {
          mergedTheme.template.LocationMessageTemplate.style.backgroundColor = cardBgColor;
        }
      }

      // Ensure prop-level chatbot.primaryComponent.secondaryColor is also applied to titles and text
      if (theme?.chatbot?.primaryComponent?.secondaryColor) {
        const titleColor = theme.chatbot.primaryComponent.secondaryColor;

        // Apply to chatbot header title color
        if (mergedTheme.chatbot.header?.title?.style) {
          mergedTheme.chatbot.header.title.style.color = titleColor;
        }

        // Apply to hint template text color
        if (mergedTheme.template?.HintMessageTemplate?.style) {
          mergedTheme.template.HintMessageTemplate.style.color = titleColor;
        }

        // Apply to button template card title color
        if (mergedTheme.template?.ButtonMessageTemplate?.title?.style) {
          mergedTheme.template.ButtonMessageTemplate.title.style.color = titleColor;
        }

        // Apply to carousel card title color
        if (mergedTheme.template?.CarouselMessageTemplate?.card?.title?.style) {
          mergedTheme.template.CarouselMessageTemplate.card.title.style.color = titleColor;
        }

        // Apply to location template card title color
        if (mergedTheme.template?.LocationMessageTemplate?.title?.style) {
          mergedTheme.template.LocationMessageTemplate.title.style.color = titleColor;
        }
      }

      // Ensure prop-level chatbot.inactiveColor is also applied to card descriptions
      if (theme?.chatbot?.inactiveColor) {
        // Apply to button template card description color
        if (mergedTheme.template?.ButtonMessageTemplate?.description?.style) {
          mergedTheme.template.ButtonMessageTemplate.description.style.color = theme.chatbot.inactiveColor;
        }

        // Apply to carousel card description color
        if (mergedTheme.template?.CarouselMessageTemplate?.card?.description?.style) {
          mergedTheme.template.CarouselMessageTemplate.card.description.style.color = theme.chatbot.inactiveColor;
        }

        // Apply to location template card description color
        if (mergedTheme.template?.LocationMessageTemplate?.description?.style) {
          mergedTheme.template.LocationMessageTemplate.description.style.color = theme.chatbot.inactiveColor;
        }
      }

      // Ensure prop-level chatbot.primaryComponent colors are also applied to card buttons
      if (theme?.chatbot?.primaryComponent?.mainColor) {
        const buttonBgColor = theme.chatbot.primaryComponent.mainColor;

        // Apply to button template button background
        if (mergedTheme.template?.ButtonMessageTemplate?.button?.style) {
          mergedTheme.template.ButtonMessageTemplate.button.style.backgroundColor = buttonBgColor;
          mergedTheme.template.ButtonMessageTemplate.button.style.borderColor = buttonBgColor;
        }

        // Apply to carousel card button background
        if (mergedTheme.template?.CarouselMessageTemplate?.card?.button?.style) {
          mergedTheme.template.CarouselMessageTemplate.card.button.style.backgroundColor = buttonBgColor;
          mergedTheme.template.CarouselMessageTemplate.card.button.style.borderColor = buttonBgColor;
        }
      }

      if (theme?.chatbot?.primaryComponent?.secondaryColor) {
        const buttonTextColor = theme.chatbot.primaryComponent.secondaryColor;

        // Apply to button template button text color
        if (mergedTheme.template?.ButtonMessageTemplate?.button?.style) {
          mergedTheme.template.ButtonMessageTemplate.button.style.color = buttonTextColor;
        }

        // Apply to carousel card button text color
        if (mergedTheme.template?.CarouselMessageTemplate?.card?.button?.style) {
          mergedTheme.template.CarouselMessageTemplate.card.button.style.color = buttonTextColor;
        }

        // Apply to quick reply button text color
        if (mergedTheme.template?.quickReplies?.button?.style) {
          mergedTheme.template.quickReplies.button.style.color = buttonTextColor;
        }
      }

      // Ensure prop-level botMessage.backgroundColor is also applied to quick reply button background
      if (theme?.botMessage?.backgroundColor) {
        const quickReplyBgColor = `${theme.botMessage.backgroundColor}33`;

        // Apply to quick reply button background color
        if (mergedTheme.template?.quickReplies?.button?.style) {
          mergedTheme.template.quickReplies.button.style.backgroundColor = quickReplyBgColor;
        }
      }

      return mergedTheme;
    },
    [theme, annotations?.embedConfig?.theme],
  );

  const value = useMemo(() => deepMergeTheme(), [deepMergeTheme]);

  return <AsgardThemeContext.Provider value={value}>{children}</AsgardThemeContext.Provider>;
}

export function useAsgardThemeContext(): AsgardThemeContextValue {
  return useContext(AsgardThemeContext);
}
